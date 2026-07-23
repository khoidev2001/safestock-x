import { InventoryService } from "../inventory.service";

/**
 * Prisma giả cho bulkImport (hoàn kho): mỗi batch giữ quantity trong bộ nhớ,
 * increment cộng vào; ghi lại các giao dịch IMPORT để assert.
 */
function fakePrisma(initial: Record<string, number>) {
  const qty = { ...initial };
  const txns: { batchId: string; type: string; quantity: number }[] = [];
  const tx = {
    itemBatch: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        where.id in qty ? { id: where.id, quantity: qty[where.id] } : null,
      update: async ({ where, data }: { where: { id: string }; data: { quantity: { increment: number } } }) => {
        qty[where.id] += data.quantity.increment;
        return { id: where.id, quantity: qty[where.id] };
      },
    },
    inventoryTransaction: {
      create: async ({ data }: { data: { batchId: string; type: string; quantity: number } }) => {
        txns.push({ batchId: data.batchId, type: data.type, quantity: data.quantity });
        return data;
      },
    },
    auditLog: { create: async () => ({}) },
  };
  const prisma = {
    $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx),
  } as never;
  return { prisma, qty, txns };
}

/** Readiness giả — bulkImport gọi recalcAfterTxn (không chặn nếu lỗi). */
function fakeService(prisma: unknown) {
  const svc = new InventoryService(prisma as never, { recalculateWarehouse: async () => {} } as never);
  // recalcAfterTxn đọc shelf.zone.warehouseId; test hoàn kho không cần → stub no-op.
  (svc as unknown as { recalcAfterTxn: () => Promise<void> }).recalcAfterTxn = async () => {};
  return svc;
}

describe("InventoryService.bulkImport (hoàn kho khi giao thất bại)", () => {
  it("nhập lại đúng số vào từng lô", async () => {
    const { prisma, qty, txns } = fakePrisma({ b1: 10, b2: 5 });
    const svc = fakeService(prisma);

    const result = await svc.bulkImport("user-1", [
      { batchId: "b1", quantity: 7 },
      { batchId: "b2", quantity: 3 },
    ], "Hoàn kho: nhiệm vụ m1 giao thất bại");

    expect(qty.b1).toBe(17);
    expect(qty.b2).toBe(8);
    expect(result.count).toBe(2);
    expect(txns).toEqual([
      { batchId: "b1", type: "IMPORT", quantity: 7 },
      { batchId: "b2", type: "IMPORT", quantity: 3 },
    ]);
  });

  it("bỏ qua dòng quantity <= 0 (không tạo giao dịch rác)", async () => {
    const { prisma, qty, txns } = fakePrisma({ b1: 10 });
    const svc = fakeService(prisma);

    const result = await svc.bulkImport("user-1", [
      { batchId: "b1", quantity: 0 },
      { batchId: "b1", quantity: -5 },
    ]);

    expect(qty.b1).toBe(10);
    expect(result.count).toBe(0);
    expect(txns).toHaveLength(0);
  });

  it("danh sách rỗng → không đụng kho, trả count 0", async () => {
    const { prisma, txns } = fakePrisma({ b1: 10 });
    const svc = fakeService(prisma);

    const result = await svc.bulkImport("user-1", []);

    expect(result).toEqual({ count: 0, batches: [] });
    expect(txns).toHaveLength(0);
  });
});
