import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { CirculationStatus, ItemCondition, LoanStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { sumOutstanding } from "../inventory/loan-math";

@Injectable()
export class LoanService {
  constructor(private prisma: PrismaService) {}

  /**
   * Mượn vật tư (Bp4). Chỉ vật tư consumable=false (tái sử dụng) mới mượn được;
   * consumable=true (nước/pin) xuất là tiêu hao thẳng, không tạo phiếu.
   * Tạo LoanRecord ON_LOAN, đánh dấu lô đang lưu hành. KHÔNG trừ tổng kho.
   */
  async borrow(
    userId: string,
    batchId: string,
    quantity: number,
    missionId?: string,
  ) {
    if (quantity <= 0) throw new BadRequestException("Số lượng mượn phải > 0");

    return this.prisma.$transaction(async (tx) => {
      const batch = await tx.itemBatch.findUnique({
        where: { id: batchId },
        include: { item: true },
      });
      if (!batch) throw new NotFoundException("Không tìm thấy lô vật tư");
      if (batch.item.consumable) {
        throw new BadRequestException(
          "Vật tư tiêu hao không mượn được — dùng xuất kho",
        );
      }

      const alreadyOnLoan = await this.sumOnLoan(tx, batchId);
      const availableNow = batch.quantity - alreadyOnLoan;
      if (quantity > availableNow) {
        throw new BadRequestException(
          `Không đủ để mượn: khả dụng ${availableNow}, yêu cầu ${quantity}`,
        );
      }

      const loan = await tx.loanRecord.create({
        data: { batchId, quantity, borrowedByUserId: userId, missionId },
      });
      // Có phần đang mượn → đánh dấu lô đang lưu hành.
      await tx.itemBatch.update({
        where: { id: batchId },
        data: { circulation: CirculationStatus.ON_LOAN },
      });
      await tx.auditLog.create({
        data: {
          actorId: userId,
          action: "LOAN_BORROW",
          entity: "LoanRecord",
          entityId: loan.id,
          metadata: { batchId, quantity, missionId },
        },
      });
      return loan;
    });
  }

  /**
   * Hoàn trả từng phần (ok/hỏng/mất). Tổng 3 phần ≤ số còn nợ của phiếu.
   * - ok → USED về kho (không đổi tổng)
   * - damaged → DAMAGED (không đổi tổng, nhưng không khả dụng)
   * - lost → trừ tổng kho (mất thật)
   * Phiếu đóng khi hoàn hết.
   */
  async returnItems(
    userId: string,
    loanId: string,
    ok: number,
    damaged: number,
    lost: number,
  ) {
    if (ok < 0 || damaged < 0 || lost < 0) {
      throw new BadRequestException("Số hoàn không được âm");
    }
    const returning = ok + damaged + lost;
    if (returning <= 0) throw new BadRequestException("Chưa nhập số hoàn");

    return this.prisma.$transaction(async (tx) => {
      const loan = await tx.loanRecord.findUnique({ where: { id: loanId } });
      if (!loan) throw new NotFoundException("Không tìm thấy phiếu mượn");
      if (loan.status === LoanStatus.CLOSED) {
        throw new BadRequestException("Phiếu mượn đã đóng");
      }

      const outstanding =
        loan.quantity - loan.returnedOk - loan.returnedDamaged - loan.lost;
      if (returning > outstanding) {
        throw new BadRequestException(
          `Hoàn quá số nợ: còn nợ ${outstanding}, hoàn ${returning}`,
        );
      }

      const newOk = loan.returnedOk + ok;
      const newDamaged = loan.returnedDamaged + damaged;
      const newLost = loan.lost + lost;
      const closed = newOk + newDamaged + newLost === loan.quantity;

      await tx.loanRecord.update({
        where: { id: loanId },
        data: {
          returnedOk: newOk,
          returnedDamaged: newDamaged,
          lost: newLost,
          status: closed ? LoanStatus.CLOSED : LoanStatus.PARTIALLY_RETURNED,
          closedAt: closed ? new Date() : null,
        },
      });

      // Mất thật → trừ tổng kho.
      if (lost > 0) {
        await tx.itemBatch.update({
          where: { id: loan.batchId },
          data: { quantity: { decrement: lost } },
        });
      }
      // Cập nhật tình trạng + trạng thái lưu hành của lô.
      await this.refreshBatchAfterReturn(tx, loan.batchId, damaged > 0);

      await tx.auditLog.create({
        data: {
          actorId: userId,
          action: "LOAN_RETURN",
          entity: "LoanRecord",
          entityId: loanId,
          metadata: { ok, damaged, lost, closed },
        },
      });

      return { loanId, ok: newOk, damaged: newDamaged, lost: newLost, closed };
    });
  }

  /** Danh sách phiếu mượn đang mở của 1 kho. */
  async listOpen(warehouseId: string) {
    return this.prisma.loanRecord.findMany({
      where: {
        status: { in: [LoanStatus.ON_LOAN, LoanStatus.PARTIALLY_RETURNED] },
        batch: { shelf: { zone: { warehouseId } } },
      },
      include: { batch: { include: { item: true } } },
      orderBy: { borrowedAt: "desc" },
    });
  }

  /** Tổng số đang mượn của 1 lô (phiếu chưa đóng). */
  private async sumOnLoan(tx: Prisma.TransactionClient, batchId: string): Promise<number> {
    const loans = await tx.loanRecord.findMany({
      where: {
        batchId,
        status: { in: [LoanStatus.ON_LOAN, LoanStatus.PARTIALLY_RETURNED] },
      },
    });
    return sumOutstanding(loans);
  }

  /**
   * Sau khi hoàn: nếu không còn phần đang mượn → lô về IN_STOCK, tình trạng USED
   * (đã qua sử dụng). Nếu có hàng hỏng khi hoàn → đánh dấu NEEDS_CHECK.
   */
  private async refreshBatchAfterReturn(
    tx: Prisma.TransactionClient,
    batchId: string,
    hadDamage: boolean,
  ) {
    const remaining = await this.sumOnLoan(tx, batchId);
    const data: Prisma.ItemBatchUpdateInput = {};
    if (remaining === 0) {
      data.circulation = CirculationStatus.IN_STOCK;
      data.condition = hadDamage ? ItemCondition.NEEDS_CHECK : ItemCondition.USED;
    }
    if (Object.keys(data).length > 0) {
      await tx.itemBatch.update({ where: { id: batchId }, data });
    }
  }
}
