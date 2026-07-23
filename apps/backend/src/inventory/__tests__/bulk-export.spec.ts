import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { InventoryService } from "../inventory.service";

function fakePrisma(
  initial: Record<string, number>,
  warehouses: Record<string, string> = {},
) {
  const quantities = { ...initial };
  const transactions: { batchId: string; type: string; source: string; quantity: number }[] = [];
  const audits: { entityId: string; metadata: { before: number; after: number } }[] = [];

  const tx = {
    itemBatch: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        if (!(where.id in quantities)) return null;
        return {
          id: where.id,
          quantity: quantities[where.id],
          shelf: { zone: { warehouseId: warehouses[where.id] ?? "warehouse-a" } },
        };
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: string; quantity: { gte: number } };
        data: { quantity: { decrement: number } };
      }) => {
        if (quantities[where.id] < where.quantity.gte) return { count: 0 };
        quantities[where.id] -= data.quantity.decrement;
        return { count: 1 };
      },
    },
    inventoryTransaction: {
      create: async ({ data }: { data: (typeof transactions)[number] }) => {
        transactions.push(data);
        return data;
      },
    },
    auditLog: {
      create: async ({
        data,
      }: {
        data: { entityId: string; metadata: { before: number; after: number } };
      }) => {
        audits.push(data);
        return data;
      },
    },
  };
  const prisma = {
    $transaction: async (fn: (client: typeof tx) => unknown) => {
      const quantitySnapshot = { ...quantities };
      const transactionCount = transactions.length;
      const auditCount = audits.length;
      try {
        return await fn(tx);
      } catch (error) {
        Object.assign(quantities, quantitySnapshot);
        transactions.splice(transactionCount);
        audits.splice(auditCount);
        throw error;
      }
    },
  } as never;
  return { prisma, tx, quantities, transactions, audits };
}

function fakeService(prisma: unknown) {
  const service = new InventoryService(
    prisma as never,
    { recalculateWarehouse: async () => {} } as never,
  );
  (service as unknown as { recalcAfterTxn: () => Promise<void> }).recalcAfterTxn = async () => {};
  return service;
}

describe("InventoryService.bulkExport", () => {
  it("xuất nhiều lô và ghi transaction/audit trong cùng transaction", async () => {
    const state = fakePrisma({ b1: 10, b2: 8 });
    const service = fakeService(state.prisma);

    const result = await service.bulkExport("user-1", [
      { batchId: "b1", quantity: 3 },
      { batchId: "b2", quantity: 2 },
    ]);

    expect(result.count).toBe(2);
    expect(state.quantities).toEqual({ b1: 7, b2: 6 });
    expect(state.transactions).toEqual([
      { batchId: "b1", userId: "user-1", type: "EXPORT", source: "BULK", quantity: 3, note: undefined },
      { batchId: "b2", userId: "user-1", type: "EXPORT", source: "BULK", quantity: 2, note: undefined },
    ]);
    expect(state.audits.map((audit) => audit.metadata)).toEqual([
      expect.objectContaining({ before: 10, after: 7 }),
      expect.objectContaining({ before: 8, after: 6 }),
    ]);
  });

  it("khóa theo batchId nhưng vẫn trả kết quả đúng thứ tự request công khai", async () => {
    const state = fakePrisma({ a: 10, z: 10 });
    const service = fakeService(state.prisma);

    const result = await service.bulkExport("user-1", [
      { batchId: "z", quantity: 1 },
      { batchId: "a", quantity: 1 },
    ]);

    expect(result.batches.map((entry) => entry.batch?.id)).toEqual(["z", "a"]);
  });

  it("batch sau thiếu tồn thì rollback cả batch đã xử lý trước", async () => {
    const state = fakePrisma({ b1: 10, b2: 1 });
    const service = fakeService(state.prisma);

    await expect(
      service.bulkExport("user-1", [
        { batchId: "b1", quantity: 3 },
        { batchId: "b2", quantity: 2 },
      ]),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(state.quantities).toEqual({ b1: 10, b2: 1 });
    expect(state.transactions).toHaveLength(0);
    expect(state.audits).toHaveLength(0);
  });

  it("scope sai bị chặn trong transaction trước khi trừ tồn", async () => {
    const state = fakePrisma({ b1: 10 }, { b1: "warehouse-b" });
    const service = fakeService(state.prisma);

    await expect(
      service.bulkExport("user-1", [{ batchId: "b1", quantity: 3 }], undefined, "warehouse-a"),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(state.quantities.b1).toBe(10);
    expect(state.transactions).toHaveLength(0);
  });

  it("danh sách rỗng vẫn giữ contract lỗi 400", async () => {
    const state = fakePrisma({ b1: 10 });
    const service = fakeService(state.prisma);

    await expect(service.bulkExport("user-1", [])).rejects.toBeInstanceOf(BadRequestException);
  });
});
