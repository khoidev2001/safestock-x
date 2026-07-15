import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
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
        data: { batchId, userId, type: TransactionType.TRANSFER, quantity, note },
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
  ) {
    return this.prisma.$transaction(async (tx) => {
      const batch = await tx.itemBatch.findUnique({ where: { id: batchId } });
      if (!batch) throw new NotFoundException("Không tìm thấy lô vật tư");

      const delta = type === TransactionType.IMPORT ? quantity : -quantity;
      const newQty = batch.quantity + delta;
      if (newQty < 0) {
        throw new BadRequestException(
          `Không đủ tồn: hiện ${batch.quantity}, yêu cầu xuất ${quantity}`,
        );
      }

      const updated = await tx.itemBatch.update({
        where: { id: batchId },
        data: { quantity: newQty },
      });
      const txn = await tx.inventoryTransaction.create({
        data: { batchId, userId, type, quantity, note },
      });
      await tx.auditLog.create({
        data: {
          actorId: userId,
          action: `INVENTORY_${type}`,
          entity: "ItemBatch",
          entityId: batchId,
          metadata: { quantity, before: batch.quantity, after: newQty },
        },
      });
      return { batch: updated, transaction: txn };
    });
  }
}
