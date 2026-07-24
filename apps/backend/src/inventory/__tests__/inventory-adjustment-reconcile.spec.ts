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
    expect(state.tx.auditLog.create).not.toHaveBeenCalled();
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
    expect(state.tx.auditLog.create).not.toHaveBeenCalled();
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
});

function makeState(options: { currentQuantity?: number } = {}) {
  const currentQuantity = options.currentQuantity ?? 5;
  const tx = {
    itemBatch: {
      findUnique: jest.fn().mockResolvedValue({
        id: "batch-1",
        quantity: currentQuantity,
        circulation: "IN_STOCK",
      }),
      updateMany: jest
        .fn()
        .mockImplementation(({ where }: { where: { quantity: number } }) =>
          Promise.resolve({ count: where.quantity === currentQuantity ? 1 : 0 }),
        ),
    },
    loanRecord: { findMany: jest.fn().mockResolvedValue([]) },
    inventoryCount: { create: jest.fn().mockResolvedValue({ id: "count-1" }) },
    auditLog: { create: jest.fn().mockResolvedValue({ id: "audit-1" }) },
  };
  const prisma = {
    $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
  };
  const readiness = { recalculateWarehouse: jest.fn().mockResolvedValue(undefined) };
  const service = new InventoryAdjustmentService(prisma as never, readiness as never);
  return { service, tx };
}
