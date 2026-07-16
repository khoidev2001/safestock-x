import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, TransactionSource } from "@prisma/client";
import { TransactionType } from "@safestock/shared-types";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class InventoryService {
  constructor(private prisma: PrismaService) {}

  // Cây kho: warehouse → zones → shelves (+ số batch mỗi shelf)
  async tree(warehouseId: string) {
    const wh = await this.prisma.warehouse.findUnique({
      where: { id: warehouseId },
      include: {
        zones: {
          include: {
            shelves: { include: { _count: { select: { batches: true } } } },
          },
        },
      },
    });
    if (!wh) throw new NotFoundException("Không tìm thấy kho");
    return wh;
  }

  async listBatches(warehouseId: string) {
    return this.prisma.itemBatch.findMany({
      where: { shelf: { zone: { warehouseId } } },
      include: { item: { include: { category: true } }, shelf: { include: { zone: true } } },
      orderBy: { createdAt: "desc" },
    });
  }

  // Scan QR: FE quét ra SKU → trả batch + vị trí + trạng thái
  async scanBySku(sku: string) {
    const item = await this.prisma.item.findUnique({
      where: { sku },
      include: {
        category: true,
        batches: { include: { shelf: { include: { zone: true } } } },
      },
    });
    if (!item) throw new NotFoundException(`Không tìm thấy vật tư SKU=${sku}`);
    return item;
  }

  async import(userId: string, batchId: string, quantity: number, note?: string) {
    return this.applyTxn(userId, batchId, TransactionType.IMPORT, quantity, note);
  }

  async export(userId: string, batchId: string, quantity: number, note?: string) {
    return this.applyTxn(userId, batchId, TransactionType.EXPORT, quantity, note);
  }

  /**
   * Xuất lô 1 chạm — chế độ khẩn cấp (Bp0). Xuất nhiều batch cùng lúc trong 1
   * transaction; mỗi dòng vẫn atomic + audit. Thất bại 1 batch → rollback tất cả.
   */
  async bulkExport(
    userId: string,
    items: { batchId: string; quantity: number }[],
    note?: string,
  ) {
    if (items.length === 0) {
      throw new BadRequestException("Danh sách xuất lô rỗng");
    }
    return this.prisma.$transaction(async (tx) => {
      const results = [] as Awaited<ReturnType<typeof this.decrementInTx>>[];
      for (const item of items) {
        results.push(
          await this.decrementInTx(
            tx,
            userId,
            item.batchId,
            item.quantity,
            TransactionType.EXPORT,
            TransactionSource.BULK,
            note,
          ),
        );
      }
      return { count: results.length, batches: results };
    });
  }

  async transfer(userId: string, batchId: string, toShelfId: string, quantity: number, note?: string) {
    const shelf = await this.prisma.shelf.findUnique({ where: { id: toShelfId } });
    if (!shelf) throw new NotFoundException("Kệ đích không tồn tại");
    // Transfer không đổi số lượng tổng, chỉ đổi vị trí — ghi giao dịch + di chuyển batch.
    return this.prisma.$transaction(async (tx) => {
      const batch = await tx.itemBatch.findUnique({ where: { id: batchId } });
      if (!batch) throw new NotFoundException("Không tìm thấy lô vật tư");
      const updated = await tx.itemBatch.update({
        where: { id: batchId },
        data: { shelfId: toShelfId },
      });
      const txn = await tx.inventoryTransaction.create({
        data: {
          batchId,
          userId,
          type: TransactionType.TRANSFER,
          source: TransactionSource.SCAN,
          quantity,
          note,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: userId,
          action: "INVENTORY_TRANSFER",
          entity: "ItemBatch",
          entityId: batchId,
          metadata: { toShelfId, quantity },
        },
      });
      return { batch: updated, transaction: txn };
    });
  }

  // Import/Export: cập nhật số lượng atomically + audit. Không cho xuất quá tồn (PRD NFR-05).
  private async applyTxn(
    userId: string,
    batchId: string,
    type: TransactionType,
    quantity: number,
    note?: string,
    source: TransactionSource = TransactionSource.SCAN,
  ) {
    return this.prisma.$transaction(async (tx) => {
      if (type === TransactionType.IMPORT) {
        return this.incrementInTx(tx, userId, batchId, quantity, note, source);
      }
      return this.decrementInTx(tx, userId, batchId, quantity, type, source, note);
    });
  }

  /**
   * Giảm số lượng lô (xuất) bằng CẬP NHẬT NGUYÊN TỬ CÓ ĐIỀU KIỆN (#6 chống race):
   * `updateMany WHERE quantity >= x`. Database tự tuần tự hóa — 2 người xuất cùng
   * lúc không âm kho. Nếu 0 dòng cập nhật → không đủ tồn.
   */
  private async decrementInTx(
    tx: Prisma.TransactionClient,
    userId: string,
    batchId: string,
    quantity: number,
    type: TransactionType,
    source: TransactionSource,
    note?: string,
  ) {
    const before = await tx.itemBatch.findUnique({ where: { id: batchId } });
    if (!before) throw new NotFoundException("Không tìm thấy lô vật tư");

    const result = await tx.itemBatch.updateMany({
      where: { id: batchId, quantity: { gte: quantity } },
      data: { quantity: { decrement: quantity } },
    });
    if (result.count === 0) {
      throw new BadRequestException(
        `Không đủ tồn: hiện ${before.quantity}, yêu cầu xuất ${quantity}`,
      );
    }

    return this.recordTxn(tx, {
      userId,
      batchId,
      type,
      source,
      quantity,
      note,
      before: before.quantity,
      after: before.quantity - quantity,
    });
  }

  /** Tăng số lượng lô (nhập). */
  private async incrementInTx(
    tx: Prisma.TransactionClient,
    userId: string,
    batchId: string,
    quantity: number,
    note: string | undefined,
    source: TransactionSource,
  ) {
    const before = await tx.itemBatch.findUnique({ where: { id: batchId } });
    if (!before) throw new NotFoundException("Không tìm thấy lô vật tư");

    await tx.itemBatch.update({
      where: { id: batchId },
      data: { quantity: { increment: quantity } },
    });
    return this.recordTxn(tx, {
      userId,
      batchId,
      type: TransactionType.IMPORT,
      source,
      quantity,
      note,
      before: before.quantity,
      after: before.quantity + quantity,
    });
  }

  /** Ghi giao dịch + audit before/after. Trả về batch đã cập nhật. */
  private async recordTxn(
    tx: Prisma.TransactionClient,
    p: {
      userId: string;
      batchId: string;
      type: TransactionType;
      source: TransactionSource;
      quantity: number;
      note?: string;
      before: number;
      after: number;
    },
  ) {
    const txn = await tx.inventoryTransaction.create({
      data: {
        batchId: p.batchId,
        userId: p.userId,
        type: p.type,
        source: p.source,
        quantity: p.quantity,
        note: p.note,
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: p.userId,
        action: `INVENTORY_${p.type}`,
        entity: "ItemBatch",
        entityId: p.batchId,
        metadata: { quantity: p.quantity, before: p.before, after: p.after, source: p.source },
      },
    });
    const batch = await tx.itemBatch.findUnique({ where: { id: p.batchId } });
    return { batch, transaction: txn };
  }

}
