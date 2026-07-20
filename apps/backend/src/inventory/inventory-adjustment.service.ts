import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { LoanStatus, Prisma, TransactionSource } from "@prisma/client";
import { TransactionType } from "@safestock/shared-types";
import { PrismaService } from "../prisma/prisma.service";
import { ReadinessService } from "../readiness/readiness.service";
import { sumOutstanding } from "./loan-math";
import { assertBatchInScope } from "./warehouse-scope";

/** Thao tác chỉnh tay + đối chiếu kiểm kê (Bp2) — tách khỏi giao dịch thường vì đều nhạy cảm, hậu kiểm. */
@Injectable()
export class InventoryAdjustmentService {
  private readonly log = new Logger(InventoryAdjustmentService.name);

  constructor(
    private prisma: PrismaService,
    private readiness: ReadinessService,
  ) {}

  /** Tính lại Readiness của kho chứa batch sau giao dịch đổi số lượng (C1). Không chặn response nếu lỗi. */
  private async recalcAfterTxn(batchId: string): Promise<void> {
    const batch = await this.prisma.itemBatch.findUnique({
      where: { id: batchId },
      select: { shelf: { select: { zone: { select: { warehouseId: true } } } } },
    });
    const warehouseId = batch?.shelf?.zone.warehouseId;
    if (!warehouseId) return;
    await this.readiness.recalculateWarehouse(warehouseId).catch((error) => {
      this.log.warn(`Recalc readiness sau giao dịch lỗi (batch ${batchId}): ${error.message}`);
    });
  }

  /**
   * Điều chỉnh thủ công số lượng — thao tác nhạy cảm, lý do BẮT BUỘC.
   * Ghi audit 5W. Đặt số lượng tuyệt đối (không phải delta).
   */
  async adjust(userId: string, batchId: string, newQuantity: number, reason: string, scopeWarehouseId?: string | null) {
    if (newQuantity < 0) {
      throw new BadRequestException("Số lượng không được âm");
    }
    await assertBatchInScope(this.prisma, scopeWarehouseId, batchId);
    const result = await this.prisma.$transaction(async (tx) => {
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
    await this.recalcAfterTxn(batchId);
    return result;
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
    scopeWarehouseId?: string | null,
  ) {
    if (countedQty < 0) throw new BadRequestException("Số kiểm kê không được âm");
    await assertBatchInScope(this.prisma, scopeWarehouseId, batchId);

    const result = await this.prisma.$transaction(async (tx) => {
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
    if (result.applied) await this.recalcAfterTxn(batchId);
    return result;
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
