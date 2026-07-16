import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { LoanStatus, Prisma, TransactionSource } from "@prisma/client";
import { TransactionType } from "@safestock/shared-types";
import { PrismaService } from "../prisma/prisma.service";
import { sumOutstanding } from "./loan-math";

/** Thao tác chỉnh tay + đối chiếu kiểm kê (Bp2) — tách khỏi giao dịch thường vì đều nhạy cảm, hậu kiểm. */
@Injectable()
export class InventoryAdjustmentService {
  constructor(private prisma: PrismaService) {}

  /**
   * Điều chỉnh thủ công số lượng — thao tác nhạy cảm, lý do BẮT BUỘC.
   * Ghi audit 5W. Đặt số lượng tuyệt đối (không phải delta).
   */
  async adjust(userId: string, batchId: string, newQuantity: number, reason: string) {
    if (newQuantity < 0) {
      throw new BadRequestException("Số lượng không được âm");
    }
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.itemBatch.findUnique({ where: { id: batchId } });
      if (!before) throw new NotFoundException("Không tìm thấy lô vật tư");

      await tx.itemBatch.update({
        where: { id: batchId },
        data: { quantity: newQuantity },
      });
      await tx.inventoryTransaction.create({
        data: {
          batchId,
          userId,
          type: TransactionType.ADJUST,
          source: TransactionSource.MANUAL,
          quantity: Math.abs(newQuantity - before.quantity),
          note: reason,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: userId,
          action: "INVENTORY_ADJUST",
          entity: "ItemBatch",
          entityId: batchId,
          metadata: { before: before.quantity, after: newQuantity, reason },
        },
      });
      return { batchId, before: before.quantity, after: newQuantity };
    });
  }

  /**
   * Đối chiếu kiểm kê — ghi số đếm thực tế + so với kỳ vọng-trong-kho.
   * Kỳ vọng = tồn hệ thống − đang mượn (#22, chỉ đếm IN_STOCK, không tính ON_LOAN).
   * Nếu ghi đè → cập nhật tồn về số đếm + phần đang mượn.
   */
  async reconcile(
    userId: string,
    batchId: string,
    countedQty: number,
    applyOverride: boolean,
    note?: string,
  ) {
    if (countedQty < 0) throw new BadRequestException("Số kiểm kê không được âm");

    return this.prisma.$transaction(async (tx) => {
      const batch = await tx.itemBatch.findUnique({ where: { id: batchId } });
      if (!batch) throw new NotFoundException("Không tìm thấy lô vật tư");

      const onLoan = await this.sumOnLoan(tx, batchId);
      const expectedInStock = batch.quantity - onLoan;
      const discrepancy = countedQty - expectedInStock;
      const willApply = applyOverride && discrepancy !== 0;

      await tx.inventoryCount.create({
        data: { batchId, countedQty, userId, note },
      });

      if (willApply) {
        // Ghi đè tồn = số đếm + phần đang mượn (kiểm kê chỉ đếm phần trong kho).
        const newSystemQty = countedQty + onLoan;
        await tx.itemBatch.update({
          where: { id: batchId },
          data: { quantity: newSystemQty },
        });
        await tx.auditLog.create({
          data: {
            actorId: userId,
            action: "INVENTORY_RECONCILE",
            entity: "ItemBatch",
            entityId: batchId,
            metadata: { before: batch.quantity, after: newSystemQty, countedQty, onLoan, discrepancy },
          },
        });
      }

      return { batchId, expectedInStock, countedQty, onLoan, discrepancy, applied: willApply };
    });
  }

  /** Tổng số đang mượn của 1 lô (LoanRecord chưa đóng). */
  private async sumOnLoan(tx: Prisma.TransactionClient, batchId: string): Promise<number> {
    const loans = await tx.loanRecord.findMany({
      where: {
        batchId,
        status: { in: [LoanStatus.ON_LOAN, LoanStatus.PARTIALLY_RETURNED] },
      },
    });
    return sumOutstanding(loans);
  }
}
