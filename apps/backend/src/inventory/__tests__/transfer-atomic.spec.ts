import { BadRequestException, ConflictException, ForbiddenException } from "@nestjs/common";
import { InventoryController } from "../inventory.controller";
import { InventoryService } from "../inventory.service";

type Batch = {
  id: string;
  itemId: string;
  shelfId: string | null;
  batchCode: string;
  quantity: number;
  status: string;
  condition: string;
  circulation: string;
  expiryDate: Date | null;
  inspectedAt: Date | null;
};

function fakeState(
  options: { forceCasFailure?: boolean; failTransaction?: boolean; openLoan?: boolean } = {},
) {
  const shelves: Record<string, string> = {
    "shelf-a1": "warehouse-a",
    "shelf-a2": "warehouse-a",
    "shelf-b1": "warehouse-b",
    "shelf-other-org": "warehouse-other-org",
  };
  const warehouseScopes: Record<string, { organizationId: string; communeId: string }> = {
    "warehouse-a": { organizationId: "org-a", communeId: "commune-a" },
    "warehouse-b": { organizationId: "org-a", communeId: "commune-a" },
    "warehouse-other-org": { organizationId: "org-b", communeId: "commune-b" },
  };
  const batches: Record<string, Batch> = {
    source: {
      id: "source",
      itemId: "item-1",
      shelfId: "shelf-a1",
      batchCode: "LOT-1",
      quantity: 10,
      status: "AVAILABLE",
      condition: "NEW",
      circulation: "IN_STOCK",
      expiryDate: new Date("2027-01-01"),
      inspectedAt: new Date("2026-07-01"),
    },
  };
  const transactions: Record<string, unknown>[] = [];
  const audits: Record<string, unknown>[] = [];
  let childCounter = 0;

  const withShelf = (batch: Batch) => ({
    ...batch,
    shelf: batch.shelfId
      ? {
          zone: {
            warehouseId: shelves[batch.shelfId],
            warehouse: warehouseScopes[shelves[batch.shelfId]],
          },
        }
      : null,
    loans: options.openLoan ? [{ quantity: 3, returnedOk: 0, returnedDamaged: 0, lost: 0 }] : [],
  });
  const tx = {
    user: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        where.id === "missing-user" ? null : { organizationId: "org-a" },
    },
    shelf: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        shelves[where.id]
          ? {
              id: where.id,
              zone: {
                warehouseId: shelves[where.id],
                warehouse: warehouseScopes[shelves[where.id]],
              },
            }
          : null,
    },
    itemBatch: {
      findUnique: async ({ where, include }: { where: { id: string }; include?: unknown }) => {
        const batch = batches[where.id];
        if (!batch) return null;
        return include ? withShelf(batch) : { ...batch };
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: {
          id: string;
          shelfId: string | null;
          quantity: number | { gte: number };
          shelf?: { zone: { warehouseId: string } };
        };
        data: { shelfId?: string; quantity?: { decrement: number } };
      }) => {
        if (options.forceCasFailure) return { count: 0 };
        const batch = batches[where.id];
        if (!batch || batch.shelfId !== where.shelfId) return { count: 0 };
        if (where.shelf && shelves[batch.shelfId as string] !== where.shelf.zone.warehouseId) {
          return { count: 0 };
        }
        const quantityMatches =
          typeof where.quantity === "number"
            ? batch.quantity === where.quantity
            : batch.quantity >= where.quantity.gte;
        if (!quantityMatches) return { count: 0 };
        if (data.quantity) batch.quantity -= data.quantity.decrement;
        if (data.shelfId) batch.shelfId = data.shelfId;
        return { count: 1 };
      },
      create: async ({ data }: { data: Omit<Batch, "id"> }) => {
        const child = { ...data, id: `child-${++childCounter}` };
        batches[child.id] = child;
        return { ...child };
      },
    },
    inventoryTransaction: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        if (options.failTransaction) throw new Error("FK transaction failed");
        const transaction = { id: `txn-${transactions.length + 1}`, ...data };
        transactions.push(transaction);
        return transaction;
      },
    },
    auditLog: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        audits.push(data);
        return data;
      },
    },
  };
  const prisma = {
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => {
      const batchSnapshot = structuredClone(batches);
      const transactionCount = transactions.length;
      const auditCount = audits.length;
      try {
        return await callback(tx);
      } catch (error) {
        Object.keys(batches).forEach((key) => delete batches[key]);
        Object.assign(batches, batchSnapshot);
        transactions.splice(transactionCount);
        audits.splice(auditCount);
        throw error;
      }
    },
  };
  return { prisma, batches, transactions, audits };
}

function serviceFor(
  state: ReturnType<typeof fakeState>,
  recalculateWarehouse: (warehouseId: string) => Promise<unknown> = async () => {},
) {
  return new InventoryService(state.prisma as never, { recalculateWarehouse } as never);
}

describe("InventoryService.transfer atomic", () => {
  it("tách partial transfer, giữ tổng quantity và ghi lineage audit", async () => {
    const state = fakeState();
    const recalculated: string[] = [];
    const service = serviceFor(state, async (warehouseId) => recalculated.push(warehouseId));

    const result = await service.transfer("user-1", "source", "shelf-a2", 4, "move", "warehouse-a");

    expect(state.batches.source.quantity).toBe(6);
    expect(result.batch).toEqual(
      expect.objectContaining({
        id: expect.stringMatching(/^child-/),
        itemId: "item-1",
        shelfId: "shelf-a2",
        quantity: 4,
        status: "AVAILABLE",
        condition: "NEW",
        circulation: "IN_STOCK",
      }),
    );
    expect(state.transactions).toEqual([
      expect.objectContaining({ batchId: result.batch?.id, type: "TRANSFER", quantity: 4 }),
    ]);
    expect(state.audits).toEqual([
      expect.objectContaining({
        entityId: "source",
        metadata: expect.objectContaining({
          sourceBatchId: "source",
          destinationBatchId: result.batch?.id,
          fromShelfId: "shelf-a1",
          toShelfId: "shelf-a2",
          before: expect.objectContaining({ sourceQuantity: 10 }),
          after: expect.objectContaining({ sourceQuantity: 6, destinationQuantity: 4 }),
          split: true,
        }),
      }),
    ]);
    expect(Object.values(state.batches).reduce((sum, batch) => sum + batch.quantity, 0)).toBe(10);
    expect(recalculated).toEqual(["warehouse-a"]);
  });

  it("full transfer giữ batch ID và recalc cả hai kho", async () => {
    const state = fakeState();
    const recalculated: string[] = [];
    const service = serviceFor(state, async (warehouseId) => recalculated.push(warehouseId));

    const result = await service.transfer("admin", "source", "shelf-b1", 10, undefined, null);

    expect(result.batch).toEqual(expect.objectContaining({ id: "source", shelfId: "shelf-b1" }));
    expect(Object.keys(state.batches)).toEqual(["source"]);
    expect(state.transactions).toHaveLength(1);
    expect(recalculated.sort()).toEqual(["warehouse-a", "warehouse-b"]);
  });

  it("chặn destination ngoài scope trước mọi mutation", async () => {
    const state = fakeState();
    const service = serviceFor(state);

    await expect(
      service.transfer("user-1", "source", "shelf-b1", 4, undefined, "warehouse-a"),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(state.batches.source).toEqual(
      expect.objectContaining({ shelfId: "shelf-a1", quantity: 10 }),
    );
    expect(state.transactions).toHaveLength(0);
    expect(state.audits).toHaveLength(0);
  });

  it("scope null vẫn chặn điều chuyển ra ngoài organization/xã", async () => {
    const state = fakeState();
    const service = serviceFor(state);

    await expect(
      service.transfer("admin", "source", "shelf-other-org", 10, undefined, null),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(state.batches.source.shelfId).toBe("shelf-a1");
  });

  it("chặn lô còn loan mở để không tách sai lineage", async () => {
    const state = fakeState({ openLoan: true });
    const service = serviceFor(state);

    await expect(
      service.transfer("user-1", "source", "shelf-a2", 4, undefined, "warehouse-a"),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(state.batches.source.quantity).toBe(10);
    expect(state.transactions).toHaveLength(0);
  });

  it("chặn circulation ON_LOAN dù dữ liệu loan record đang lệch", async () => {
    const state = fakeState();
    state.batches.source.circulation = "ON_LOAN";
    const service = serviceFor(state);

    await expect(
      service.transfer("user-1", "source", "shelf-a2", 4, undefined, "warehouse-a"),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(state.batches.source.quantity).toBe(10);
  });

  it("không làm lộ batch không tồn tại cho user bị scope", async () => {
    const state = fakeState();
    const service = serviceFor(state);

    await expect(
      service.transfer("user-1", "missing", "shelf-a2", 4, undefined, "warehouse-a"),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it.each([
    ["same shelf", "shelf-a1", 4],
    ["over quantity", "shelf-a2", 11],
    ["invalid quantity", "shelf-a2", 0],
  ])("%s trả 400 và không ghi ledger", async (_name, shelfId, quantity) => {
    const state = fakeState();
    const service = serviceFor(state);

    await expect(service.transfer("user-1", "source", shelfId, quantity)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(state.transactions).toHaveLength(0);
    expect(state.audits).toHaveLength(0);
  });

  it("CAS loser trả 409 và rollback mọi write", async () => {
    const state = fakeState({ forceCasFailure: true });
    const service = serviceFor(state);

    await expect(service.transfer("user-1", "source", "shelf-a2", 4)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(state.batches.source.quantity).toBe(10);
    expect(state.transactions).toHaveLength(0);
    expect(state.audits).toHaveLength(0);
  });

  it("ledger failure rollback source và child", async () => {
    const state = fakeState({ failTransaction: true });
    const service = serviceFor(state);

    await expect(service.transfer("user-1", "source", "shelf-a2", 4)).rejects.toThrow(
      "FK transaction failed",
    );
    expect(Object.keys(state.batches)).toEqual(["source"]);
    expect(state.batches.source.quantity).toBe(10);
    expect(state.audits).toHaveLength(0);
  });

  it("readiness failure hậu commit không đổi transfer thành failure", async () => {
    const state = fakeState();
    const service = serviceFor(state, async () => {
      throw new Error("readiness unavailable");
    });

    await expect(service.transfer("user-1", "source", "shelf-a2", 4)).resolves.toEqual(
      expect.objectContaining({ batch: expect.objectContaining({ quantity: 4 }) }),
    );
    expect(state.batches.source.quantity).toBe(6);
  });
});

describe("InventoryController.transfer", () => {
  it("forward warehouse scope từ JWT", async () => {
    const transfer = jest.fn().mockResolvedValue({ ok: true });
    const controller = new InventoryController({ transfer } as never, {} as never);

    await controller.transfer({ user: { userId: "user-1", warehouseId: "warehouse-a" } } as never, {
      batchId: "source",
      toShelfId: "shelf-a2",
      quantity: 4,
      note: "move",
    });

    expect(transfer).toHaveBeenCalledWith("user-1", "source", "shelf-a2", 4, "move", "warehouse-a");
  });
});
