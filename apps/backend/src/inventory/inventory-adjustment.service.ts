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
  LoanStatus,
  Prisma,
  TransactionSource,
} from "@prisma/client";
import { TransactionType } from "@safestock/shared-types";
import { PrismaService } from "../prisma/prisma.service";
import { ReadinessService } from "../readiness/readiness.service";
import { lockLoanBatch, lockLoanTableForApproval } from "../loan/loan-table-lock";
import { sumOutstanding } from "./loan-math";
import { mutationFingerprint, withMutationIdempotency } from "./mutation-idempotency";
import { assertActorCanAccessBatch } from "./warehouse-scope";

type ReconcileInTxOptions = {
  requireStableSnapshot?: boolean;
  expectedBatch?: {
    quantity: number;
    circulation: CirculationStatus;
  };
};

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
  async adjust(
    userId: string,
    batchId: string,
    newQuantity: number,
    reason: string,
    scopeWarehouseId?: string | null,
    requestId?: string,
  ) {
    if (newQuantity < 0) {
      throw new BadRequestException("Số lượng không được âm");
    }
    await assertActorCanAccessBatch(this.prisma, userId, scopeWarehouseId, batchId);
    const result = await this.prisma.$transaction((tx) =>
      withMutationIdempotency(
        tx,
        {
          actorId: userId,
          operation: "inventory.adjust",
          requestId,
          fingerprint: mutationFingerprint({ batchId, newQuantity, reason }),
        },
        async () => {
          await lockLoanTableForApproval(tx);
          await lockLoanBatch(tx, batchId);
          const before = await tx.itemBatch.findUnique({
            where: { id: batchId },
            include: { shelf: { select: { zone: { select: { warehouseId: true } } } } },
          });
          if (!before) throw new NotFoundException("Không tìm thấy lô vật tư");
          const outstandingLoan = await this.sumOnLoan(tx, batchId);
          if (newQuantity < outstandingLoan) {
            throw new ConflictException(
              `Tồn mới không được thấp hơn ${outstandingLoan} đơn vị đang cho mượn`,
            );
          }

          const claimed = await tx.itemBatch.updateMany({
            where: {
              id: batchId,
              quantity: before.quantity,
              ...(scopeWarehouseId ? { shelf: { zone: { warehouseId: scopeWarehouseId } } } : {}),
            },
            data: { quantity: newQuantity },
          });
          if (claimed.count === 0) {
            throw new ConflictException("Tồn kho vừa thay đổi; hãy tải lại trước khi điều chỉnh");
          }
          await tx.inventoryTransaction.create({
            data: {
              batchId,
              userId,
              type: TransactionType.ADJUST,
              source: TransactionSource.MANUAL,
              quantity: Math.abs(newQuantity - before.quantity),
              beforeQuantity: before.quantity,
              afterQuantity: newQuantity,
              quantityDelta: newQuantity - before.quantity,
              note: reason,
              warehouseId: before.shelf?.zone.warehouseId,
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
        },
      ),
    );
    await this.recalcAfterTxn(batchId);
    return result;
  }

  async setCondition(
    userId: string,
    batchId: string,
    condition: ItemCondition,
    note: string,
    scopeWarehouseId?: string | null,
    requestId?: string,
  ) {
    const normalizedNote = note.trim();
    if (normalizedNote.length < 3) {
      throw new BadRequestException("Ghi chú tình trạng phải có ít nhất 3 ký tự");
    }
    const result = await this.prisma.$transaction((tx) =>
      withMutationIdempotency(
        tx,
        {
          actorId: userId,
          operation: "inventory.condition",
          requestId,
          fingerprint: mutationFingerprint({
            batchId,
            condition,
            note: normalizedNote,
          }),
        },
        async () => {
          await lockLoanTableForApproval(tx);
          await lockLoanBatch(tx, batchId);
          await assertActorCanAccessBatch(tx, userId, scopeWarehouseId, batchId);
          const before = await tx.itemBatch.findUnique({
            where: { id: batchId },
            include: { shelf: { select: { zone: { select: { warehouseId: true } } } } },
          });
          if (!before) throw new NotFoundException("Không tìm thấy lô vật tư");

          await tx.itemBatch.update({
            where: { id: batchId },
            data: { condition },
          });
          await tx.inventoryTransaction.create({
            data: {
              batchId,
              userId,
              type: TransactionType.CONDITION,
              source: TransactionSource.MANUAL,
              quantity: 0,
              beforeQuantity: before.quantity,
              afterQuantity: before.quantity,
              quantityDelta: 0,
              note: normalizedNote,
              warehouseId: before.shelf?.zone.warehouseId,
            },
          });
          await tx.auditLog.create({
            data: {
              actorId: userId,
              action: "INVENTORY_CONDITION",
              entity: "ItemBatch",
              entityId: batchId,
              metadata: {
                before: before.condition,
                after: condition,
                note: normalizedNote,
              },
            },
          });
          return { batchId, before: before.condition, after: condition };
        },
      ),
    );
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
    requestId?: string,
  ) {
    if (countedQty < 0) throw new BadRequestException("Số kiểm kê không được âm");
    const result = await this.prisma.$transaction((tx) =>
      withMutationIdempotency(
        tx,
        {
          actorId: userId,
          operation: "inventory.reconcile",
          requestId,
          fingerprint: mutationFingerprint({
            batchId,
            countedQty,
            applyOverride,
            note,
          }),
        },
        async () => {
          await lockLoanTableForApproval(tx);
          await lockLoanBatch(tx, batchId);
          return this.reconcileInTx(
            tx,
            userId,
            batchId,
            countedQty,
            applyOverride,
            note,
            scopeWarehouseId,
          );
        },
      ),
    );
    if (result.applied) await this.recalcAfterTxn(batchId);
    return result;
  }

  async reconcileInTx(
    tx: Prisma.TransactionClient,
    userId: string,
    batchId: string,
    countedQty: number,
    applyOverride: boolean,
    note?: string,
    scopeWarehouseId?: string | null,
    options: ReconcileInTxOptions = {},
  ) {
    if (countedQty < 0) throw new BadRequestException("Số kiểm kê không được âm");
    await assertActorCanAccessBatch(tx, userId, scopeWarehouseId, batchId);

    const batch = await tx.itemBatch.findUnique({
      where: { id: batchId },
      include: { shelf: { select: { zone: { select: { warehouseId: true } } } } },
    });
    if (!batch) throw new NotFoundException("Không tìm thấy lô vật tư");

    const onLoan = await this.sumOnLoan(tx, batchId);
    const snapshotQuantity = options.expectedBatch?.quantity ?? batch.quantity;
    const snapshotCirculation = options.expectedBatch?.circulation ?? batch.circulation;
    const expectedInStock = snapshotQuantity - onLoan;
    const discrepancy = countedQty - expectedInStock;
    const willApply = applyOverride && discrepancy !== 0;
    const newSystemQty = willApply ? countedQty + onLoan : snapshotQuantity;
    const scopeWhere = scopeWarehouseId
      ? { shelf: { zone: { warehouseId: scopeWarehouseId } } }
      : {};

    if (willApply || options.requireStableSnapshot) {
      const claim = await tx.itemBatch.updateMany({
        where: {
          id: batchId,
          quantity: snapshotQuantity,
          circulation: snapshotCirculation,
          ...scopeWhere,
        },
        data: { quantity: newSystemQty },
      });
      if (claim.count === 0) {
        throw new ConflictException("Lô vật tư vừa được cập nhật; hãy tải lại trước khi đối chiếu");
      }
    }

    await tx.inventoryCount.create({
      data: { batchId, countedQty, userId, note },
    });
    await tx.inventoryTransaction.create({
      data: {
        batchId,
        userId,
        type: TransactionType.COUNT,
        source: TransactionSource.MANUAL,
        quantity: countedQty,
        beforeQuantity: snapshotQuantity,
        afterQuantity: newSystemQty,
        quantityDelta: newSystemQty - snapshotQuantity,
        note: note ?? (willApply ? "Kiểm kê và áp chênh lệch" : "Ghi nhận số đếm thực tế"),
        warehouseId: batch.shelf?.zone.warehouseId,
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: userId,
        action: willApply ? "INVENTORY_RECONCILE" : "INVENTORY_COUNT",
        entity: "ItemBatch",
        entityId: batchId,
        metadata: {
          before: snapshotQuantity,
          after: newSystemQty,
          countedQty,
          onLoan,
          discrepancy,
          applied: willApply,
          note: note ?? null,
        },
      },
    });

    return { batchId, expectedInStock, countedQty, onLoan, discrepancy, applied: willApply };
  }

  async recalculateWarehousesAfterCommit(warehouseIds: string[]): Promise<void> {
    await Promise.all(
      [...new Set(warehouseIds)].map((warehouseId) =>
        this.readiness.recalculateWarehouse(warehouseId).catch((error) => {
          this.log.warn(
            `Recalc readiness sau đối chiếu lỗi (kho ${warehouseId}): ${error.message}`,
          );
        }),
      ),
    );
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
