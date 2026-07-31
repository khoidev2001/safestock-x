import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import {
  CirculationStatus,
  ItemCondition,
  ItemStatus,
  LoanStatus,
  Prisma,
  TransactionSource,
} from "@prisma/client";
import { TransactionType } from "@safestock/shared-types";
import { PrismaService } from "../prisma/prisma.service";
import { ReadinessService } from "../readiness/readiness.service";
import { sumOutstanding } from "../inventory/loan-math";
import { mutationFingerprint, withMutationIdempotency } from "../inventory/mutation-idempotency";
import {
  assertActorCanAccessBatch,
  assertActorCanAccessWarehouse,
  assertWarehouseInScope,
} from "../inventory/warehouse-scope";
import { lockLoanBatch, lockLoanTableForMutation } from "./loan-table-lock";
import { randomUUID } from "node:crypto";

@Injectable()
export class LoanService {
  private readonly log = new Logger(LoanService.name);

  constructor(
    private prisma: PrismaService,
    private readiness: ReadinessService,
  ) {}

  /**
   * Tính lại Readiness của kho chứa lô sau khi mượn/hoàn (gap C). Mượn/hoàn đổi
   * onLoanQty → "khả dụng ngay" đổi → điểm phải cập nhật. Chạy SAU transaction để
   * đọc dữ liệu đã commit; lỗi chỉ log, không chặn response.
   */
  private async recalcAfterLoanTxn(batchId: string): Promise<void> {
    const batch = await this.prisma.itemBatch.findUnique({
      where: { id: batchId },
      select: { shelf: { select: { zone: { select: { warehouseId: true } } } } },
    });
    const warehouseId = batch?.shelf?.zone.warehouseId;
    if (!warehouseId) return;
    await this.readiness.recalculateWarehouse(warehouseId).catch((error) => {
      this.log.warn(
        `Recalc readiness sau giao dịch mượn/hoàn lỗi (lô ${batchId}): ${error.message}`,
      );
    });
  }

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
    scopeWarehouseId?: string | null,
    requestId?: string,
  ) {
    await assertActorCanAccessBatch(this.prisma, userId, scopeWarehouseId, batchId);
    if (quantity <= 0) throw new BadRequestException("Số lượng mượn phải > 0");

    const loan = await this.prisma.$transaction((tx) =>
      withMutationIdempotency(
        tx,
        {
          actorId: userId,
          operation: "loan.borrow",
          requestId,
          fingerprint: mutationFingerprint({
            batchId,
            quantity,
            missionId,
          }),
        },
        async () => {
          await lockLoanTableForMutation(tx);
          await lockLoanBatch(tx, batchId);
          const batch = await tx.itemBatch.findUnique({
            where: { id: batchId },
            include: { item: true, shelf: { select: { isLocked: true } } },
          });
          if (!batch) throw new NotFoundException("Không tìm thấy lô vật tư");
          if (batch.item.consumable) {
            throw new BadRequestException("Vật tư tiêu hao không mượn được — dùng xuất kho");
          }

          if (
            batch.status !== ItemStatus.AVAILABLE ||
            (batch.condition !== ItemCondition.NEW && batch.condition !== ItemCondition.USED)
          ) {
            throw new ConflictException("Lô vật tư không ở tình trạng sẵn sàng để cho mượn");
          }
          if (batch.shelf?.isLocked) {
            throw new ConflictException("Kệ chứa lô đang bị khóa");
          }
          if (batch.expiryDate && batch.expiryDate.getTime() <= Date.now()) {
            throw new ConflictException("Lô vật tư đã hết hạn");
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
        },
      ),
    );

    await this.recalcAfterLoanTxn(batchId);
    return loan;
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
    scopeWarehouseId?: string | null,
    requestId?: string,
  ) {
    if (ok < 0 || damaged < 0 || lost < 0) {
      throw new BadRequestException("Số hoàn không được âm");
    }
    const returning = ok + damaged + lost;
    if (returning <= 0) throw new BadRequestException("Chưa nhập số hoàn");

    const result = await this.prisma.$transaction((tx) =>
      withMutationIdempotency(
        tx,
        {
          actorId: userId,
          operation: "loan.return",
          requestId,
          fingerprint: mutationFingerprint({
            loanId,
            ok,
            damaged,
            lost,
          }),
        },
        async () => {
          await lockLoanTableForMutation(tx);
          let loan = await tx.loanRecord.findUnique({ where: { id: loanId } });
          if (!loan) throw new NotFoundException("Không tìm thấy phiếu mượn");
          await lockLoanBatch(tx, loan.batchId);
          loan = await tx.loanRecord.findUnique({ where: { id: loanId } });
          if (!loan) throw new NotFoundException("Không tìm thấy phiếu mượn");
          await assertActorCanAccessBatch(tx, userId, scopeWarehouseId, loan.batchId);
          if (loan.status === LoanStatus.CLOSED) {
            throw new BadRequestException("Phiếu mượn đã đóng");
          }

          const outstanding = loan.quantity - loan.returnedOk - loan.returnedDamaged - loan.lost;
          if (returning > outstanding) {
            throw new BadRequestException(
              `Hoàn quá số nợ: còn nợ ${outstanding}, hoàn ${returning}`,
            );
          }

          const newOk = loan.returnedOk + ok;
          const newDamaged = loan.returnedDamaged + damaged;
          const newLost = loan.lost + lost;
          const closed = newOk + newDamaged + newLost === loan.quantity;
          const sourceBatch = await tx.itemBatch.findUnique({
            where: { id: loan.batchId },
            include: { shelf: { select: { zone: { select: { warehouseId: true } } } } },
          });
          if (!sourceBatch) throw new NotFoundException("Không tìm thấy lô vật tư");

          const loanClaim = await tx.loanRecord.updateMany({
            where: {
              id: loanId,
              status: loan.status,
              returnedOk: loan.returnedOk,
              returnedDamaged: loan.returnedDamaged,
              lost: loan.lost,
            },
            data: {
              returnedOk: newOk,
              returnedDamaged: newDamaged,
              lost: newLost,
              status: closed ? LoanStatus.CLOSED : LoanStatus.PARTIALLY_RETURNED,
              closedAt: closed ? new Date() : null,
            },
          });
          if (loanClaim.count === 0) {
            throw new ConflictException("Phiếu mượn vừa được cập nhật; hãy tải lại trước khi hoàn");
          }

          // Hàng hỏng vẫn còn về kho nhưng phải tách khỏi lô dùng được; hàng mất bị
          // loại khỏi tồn vật lý. CAS giữ tổng kho không bao giờ âm khi dữ liệu lệch.
          const removedFromSource = damaged + lost;
          if (removedFromSource > 0) {
            const claimed = await tx.itemBatch.updateMany({
              where: { id: loan.batchId, quantity: { gte: removedFromSource } },
              data: { quantity: { decrement: removedFromSource } },
            });
            if (claimed.count === 0) {
              throw new ConflictException(
                "Tồn vật lý không đủ để ghi nhận hàng hỏng/mất; cần kiểm kê lại lô",
              );
            }
          }
          const damagedBatch =
            damaged > 0
              ? await tx.itemBatch.create({
                  data: {
                    itemId: sourceBatch.itemId,
                    shelfId: sourceBatch.shelfId,
                    batchCode: `${sourceBatch.batchCode}-RET-${randomUUID()}`,
                    quantity: damaged,
                    status: sourceBatch.status,
                    condition: ItemCondition.NEEDS_CHECK,
                    circulation: CirculationStatus.IN_STOCK,
                    expiryDate: sourceBatch.expiryDate,
                    inspectedAt: null,
                  },
                })
              : null;
          // Cập nhật tình trạng + trạng thái lưu hành của lô.
          await this.refreshBatchAfterReturn(tx, loan.batchId);
          const transaction = await tx.inventoryTransaction.create({
            data: {
              batchId: loan.batchId,
              userId,
              type: TransactionType.RETURN,
              source: TransactionSource.MANUAL,
              quantity: returning,
              beforeQuantity: sourceBatch.quantity,
              afterQuantity: sourceBatch.quantity - removedFromSource,
              quantityDelta: -removedFromSource,
              warehouseId: sourceBatch.shelf?.zone?.warehouseId,
              note: `Hoàn tốt ${ok}; hỏng ${damaged}; mất ${lost}`,
            },
          });

          await tx.auditLog.create({
            data: {
              actorId: userId,
              action: "LOAN_RETURN",
              entity: "LoanRecord",
              entityId: loanId,
              metadata: {
                ok,
                damaged,
                lost,
                closed,
                damagedBatchId: damagedBatch?.id ?? null,
                transactionId: transaction.id,
              },
            },
          });

          return {
            loanId,
            batchId: loan.batchId,
            ok: newOk,
            damaged: newDamaged,
            lost: newLost,
            closed,
            damagedBatchId: damagedBatch?.id ?? null,
          };
        },
      ),
    );

    await this.recalcAfterLoanTxn(result.batchId);
    const { batchId: _batchId, ...response } = result;
    return response;
  }

  /** Danh sách phiếu mượn đang mở của 1 kho. */
  async listOpen(warehouseId: string, scopeWarehouseId?: string | null, actorUserId?: string) {
    if (actorUserId) {
      await assertActorCanAccessWarehouse(this.prisma, actorUserId, scopeWarehouseId, warehouseId);
    } else {
      assertWarehouseInScope(scopeWarehouseId, warehouseId);
    }
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
  private async refreshBatchAfterReturn(tx: Prisma.TransactionClient, batchId: string) {
    const remaining = await this.sumOnLoan(tx, batchId);
    const data: Prisma.ItemBatchUpdateInput = {};
    if (remaining === 0) {
      data.circulation = CirculationStatus.IN_STOCK;
      // Phần hỏng đã được tách thành batch NEEDS_CHECK riêng; batch nguồn chỉ
      // còn phần hoàn tốt/chưa từng rời kho.
      data.condition = ItemCondition.USED;
    }
    if (Object.keys(data).length > 0) {
      await tx.itemBatch.update({ where: { id: batchId }, data });
    }
  }
}
