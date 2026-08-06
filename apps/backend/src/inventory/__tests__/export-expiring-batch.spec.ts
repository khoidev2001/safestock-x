import { ItemStatus } from "@prisma/client";
import { InventoryService } from "../inventory.service";

/**
 * Lô sắp hết hạn phải xuất được — nếu không thì phương án điều phối kẹt vĩnh viễn.
 *
 * Bộ lọc lúc lập phương án (assessBatchEligibility) coi lô EXPIRING_SOON là khả
 * dụng, nên nó vẫn được phân bổ vào nhiệm vụ. Chốt lúc xuất mà từ chối chính lô
 * đó thì kho bấm "Xác nhận xuất vật tư" là gặp lỗi, nhiệm vụ không bao giờ sang
 * được READY và hàng sắp hết hạn nằm chờ tới lúc hỏng thật.
 */
function fakePrisma(batch: {
  quantity: number;
  status?: ItemStatus;
  condition?: string;
  expiryDate?: Date | null;
  isLocked?: boolean;
}) {
  let quantity = batch.quantity;
  const tx = {
    $executeRawUnsafe: async () => 0,
    itemBatch: {
      findUnique: async () => ({
        id: "b1",
        quantity,
        status: batch.status,
        condition: batch.condition ?? "NEW",
        expiryDate: batch.expiryDate ?? null,
        shelf: { isLocked: batch.isLocked ?? false, zone: { warehouseId: "warehouse-a" } },
      }),
      updateMany: async ({ data }: { data: { quantity: { decrement: number } } }) => {
        quantity -= data.quantity.decrement;
        return { count: 1 };
      },
    },
    loanRecord: { findMany: async () => [] },
    inventoryTransaction: { create: async () => ({}) },
    auditLog: { create: async () => ({}) },
  };
  const prisma = {
    $transaction: async (fn: (client: typeof tx) => unknown) => fn(tx),
  } as never;
  return { prisma, current: () => quantity };
}

function fakeService(prisma: unknown) {
  const service = new InventoryService(
    prisma as never,
    { recalculateWarehouse: async () => {} } as never,
  );
  (service as unknown as { recalcAfterTxn: () => Promise<void> }).recalcAfterTxn = async () => {};
  return service;
}

const NEXT_MONTH = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
const LAST_MONTH = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

describe("InventoryService xuất lô sắp hết hạn", () => {
  it("cho xuất lô EXPIRING_SOON còn hạn — đúng nguyên tắc hạn gần đi trước", async () => {
    const state = fakePrisma({
      quantity: 1_000,
      status: ItemStatus.EXPIRING_SOON,
      expiryDate: NEXT_MONTH,
    });
    const service = fakeService(state.prisma);

    await service.bulkExport("user-1", [{ batchId: "b1", quantity: 570 }]);

    expect(state.current()).toBe(430);
  });

  it("vẫn chặn lô đã hết hạn thật", async () => {
    const state = fakePrisma({
      quantity: 1_000,
      status: ItemStatus.EXPIRING_SOON,
      expiryDate: LAST_MONTH,
    });
    const service = fakeService(state.prisma);

    await expect(service.bulkExport("user-1", [{ batchId: "b1", quantity: 10 }])).rejects.toThrow(
      /hết hạn/i,
    );
    expect(state.current()).toBe(1_000);
  });

  it.each([
    ItemStatus.DAMAGED,
    ItemStatus.MAINTENANCE,
    ItemStatus.INSPECTION_OVERDUE,
    ItemStatus.MISPLACED,
    ItemStatus.INACCESSIBLE,
    ItemStatus.UNKNOWN,
    ItemStatus.IN_USE,
  ])("vẫn chặn lô ở trạng thái %s", async (status) => {
    const state = fakePrisma({ quantity: 1_000, status, expiryDate: NEXT_MONTH });
    const service = fakeService(state.prisma);

    await expect(service.bulkExport("user-1", [{ batchId: "b1", quantity: 10 }])).rejects.toThrow(
      /không ở trạng thái có thể xuất/i,
    );
    expect(state.current()).toBe(1_000);
  });
});
