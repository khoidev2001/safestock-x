import { ConflictException } from "@nestjs/common";
import { InventoryAdjustmentService } from "../inventory-adjustment.service";

describe("InventoryAdjustmentService.reconcile no-op behavior", () => {
  it.each([
    ["count-only reconciliation", false, 3],
    ["zero-discrepancy override", true, 5],
  ])("does not write ItemBatch for %s", async (_case, applyOverride, countedQty) => {
    const state = makeState();

    const result = await state.service.reconcile("user-1", "batch-1", countedQty, applyOverride);

    expect(result.applied).toBe(false);
    expect(state.tx.itemBatch.updateMany).not.toHaveBeenCalled();
    expect(state.tx.inventoryCount.create).toHaveBeenCalledTimes(1);
    expect(state.tx.inventoryTransaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        beforeQuantity: 5,
        afterQuantity: 5,
        quantityDelta: 0,
      }),
    });
    expect(state.tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "INVENTORY_COUNT",
        actorId: "user-1",
        entityId: "batch-1",
      }),
    });
  });

  it("keeps the no-op CAS when a caller requires a stable snapshot", async () => {
    const state = makeState();

    const result = await state.service.reconcileInTx(
      state.tx as never,
      "user-1",
      "batch-1",
      5,
      true,
      undefined,
      undefined,
      { requireStableSnapshot: true },
    );

    expect(result.applied).toBe(false);
    expect(state.tx.itemBatch.updateMany).toHaveBeenCalledWith({
      where: { id: "batch-1", quantity: 5, circulation: "IN_STOCK" },
      data: { quantity: 5 },
    });
    expect(state.tx.inventoryCount.create).toHaveBeenCalledTimes(1);
    expect(state.tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "INVENTORY_COUNT",
        actorId: "user-1",
        entityId: "batch-1",
      }),
    });
  });

  it("rejects when the batch changed after the caller captured its snapshot", async () => {
    const state = makeState({ currentQuantity: 3 });

    await expect(
      state.service.reconcileInTx(
        state.tx as never,
        "user-1",
        "batch-1",
        4,
        true,
        undefined,
        undefined,
        {
          requireStableSnapshot: true,
          expectedBatch: { quantity: 5, circulation: "IN_STOCK" },
        },
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(state.tx.inventoryCount.create).not.toHaveBeenCalled();
    expect(state.tx.auditLog.create).not.toHaveBeenCalled();
  });

  it("rejects a manual adjustment when a concurrent transaction changed the batch", async () => {
    const state = makeState({ claimCount: 0 });

    await expect(
      state.service.adjust("user-1", "batch-1", 7, "Đối chiếu tồn thực tế"),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(state.tx.itemBatch.updateMany).toHaveBeenCalledWith({
      where: { id: "batch-1", quantity: 5 },
      data: { quantity: 7 },
    });
    expect(state.tx.auditLog.create).not.toHaveBeenCalled();
    expect(state.readiness.recalculateWarehouse).not.toHaveBeenCalled();
  });

  it("persists a reported batch condition, audit trail and readiness refresh", async () => {
    const state = makeState();

    await expect(
      state.service.setCondition(
        "user-1",
        "batch-1",
        "NEEDS_CHECK",
        "Vỏ áo phao bị rách",
        "warehouse-1",
      ),
    ).resolves.toEqual({
      batchId: "batch-1",
      before: "NEW",
      after: "NEEDS_CHECK",
    });

    expect(state.tx.itemBatch.update).toHaveBeenCalledWith({
      where: { id: "batch-1" },
      data: { condition: "NEEDS_CHECK" },
    });
    expect(state.tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: "user-1",
        action: "INVENTORY_CONDITION",
        entityId: "batch-1",
        metadata: {
          before: "NEW",
          after: "NEEDS_CHECK",
          note: "Vỏ áo phao bị rách",
        },
      }),
    });
    expect(state.readiness.recalculateWarehouse).toHaveBeenCalledWith("warehouse-1");
  });
});

function makeState(options: { currentQuantity?: number; claimCount?: number } = {}) {
  const currentQuantity = options.currentQuantity ?? 5;
  const tx = {
    $executeRawUnsafe: jest.fn().mockResolvedValue(0),
    itemBatch: {
      findUnique: jest
        .fn()
        .mockImplementation(
          ({ select, include }: { select?: { shelf?: unknown }; include?: { shelf?: unknown } }) =>
            Promise.resolve(
              select?.shelf
                ? { shelf: { zone: { warehouseId: "warehouse-1" } } }
                : {
                    id: "batch-1",
                    quantity: currentQuantity,
                    circulation: "IN_STOCK",
                    condition: "NEW",
                    ...(include?.shelf ? { shelf: { zone: { warehouseId: "warehouse-1" } } } : {}),
                  },
            ),
        ),
      update: jest.fn().mockResolvedValue({ id: "batch-1" }),
      updateMany: jest.fn().mockImplementation(({ where }: { where: { quantity: number } }) =>
        Promise.resolve({
          count: options.claimCount ?? (where.quantity === currentQuantity ? 1 : 0),
        }),
      ),
    },
    loanRecord: { findMany: jest.fn().mockResolvedValue([]) },
    inventoryCount: { create: jest.fn().mockResolvedValue({ id: "count-1" }) },
    inventoryTransaction: { create: jest.fn().mockResolvedValue({ id: "transaction-1" }) },
    auditLog: { create: jest.fn().mockResolvedValue({ id: "audit-1" }) },
  };
  const prisma = {
    $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    itemBatch: {
      findUnique: jest.fn().mockResolvedValue({
        shelf: { zone: { warehouseId: "warehouse-1" } },
      }),
    },
  };
  const readiness = { recalculateWarehouse: jest.fn().mockResolvedValue(undefined) };
  const service = new InventoryAdjustmentService(prisma as never, readiness as never);
  return { service, tx, readiness };
}
