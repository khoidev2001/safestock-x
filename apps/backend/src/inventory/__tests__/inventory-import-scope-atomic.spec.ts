import { ForbiddenException } from "@nestjs/common";
import { TransactionSource } from "@prisma/client";
import { InventoryService } from "../inventory.service";

describe("InventoryService scoped import atomicity", () => {
  it("rechecks warehouse scope inside the mutation transaction", async () => {
    const outsideBatch = {
      findUnique: jest.fn().mockResolvedValue({ shelf: { zone: { warehouseId: "warehouse-1" } } }),
    };
    const tx = {
      itemBatch: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({ id: "batch-1", quantity: 10 })
          .mockResolvedValueOnce({ shelf: { zone: { warehouseId: "warehouse-2" } } }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      inventoryTransaction: { create: jest.fn() },
      auditLog: { create: jest.fn() },
    };
    const prisma = {
      itemBatch: outsideBatch,
      $transaction: jest.fn((callback: (client: unknown) => unknown) => callback(tx)),
    };
    const service = new InventoryService(
      prisma as never,
      { recalculateWarehouse: jest.fn() } as never,
    );

    await expect(
      service.import(
        "system-actor",
        "batch-1",
        2,
        "loadcell",
        TransactionSource.LOADCELL,
        "warehouse-1",
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(tx.itemBatch.updateMany).toHaveBeenCalledWith({
      where: {
        id: "batch-1",
        shelf: { zone: { warehouseId: "warehouse-1" } },
      },
      data: { quantity: { increment: 2 } },
    });
    expect(tx.inventoryTransaction.create).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });
});
