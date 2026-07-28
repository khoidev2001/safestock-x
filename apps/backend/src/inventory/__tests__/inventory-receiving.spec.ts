import { BadRequestException } from "@nestjs/common";
import { InventoryService } from "../inventory.service";

describe("InventoryService.receiveBatch", () => {
  it("rejects a batch whose expiry date is before today", async () => {
    const prisma = { $transaction: jest.fn() };
    const service = new InventoryService(
      prisma as never,
      { recalculateWarehouse: jest.fn() } as never,
    );
    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);

    await expect(
      service.receiveBatch("user-1", {
        itemId: "item-1",
        shelfId: "shelf-1",
        batchCode: "LOT-EXPIRED",
        quantity: 1,
        expiryDate: yesterday,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("creates a new located batch, import ledger, audit and QR payload atomically", async () => {
    const writes: Record<string, unknown>[] = [];
    const tx = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ organizationId: "org-1" }),
      },
      shelf: {
        findUnique: jest.fn().mockResolvedValue({
          id: "shelf-1",
          isLocked: false,
          zone: { warehouseId: "warehouse-1", warehouse: { organizationId: "org-1" } },
        }),
      },
      item: {
        findUnique: jest.fn().mockResolvedValue({
          id: "item-1",
          sku: "AO-PHAO",
          name: "Áo phao",
          batches: [{ id: "existing-batch" }],
        }),
      },
      itemBatch: {
        findUnique: jest.fn().mockResolvedValue({
          id: "batch-new",
          itemId: "item-1",
          shelfId: "shelf-1",
          batchCode: "LOT-2026-01",
          quantity: 20,
          item: { id: "item-1", sku: "AO-PHAO", name: "Áo phao" },
          shelf: { id: "shelf-1", code: "A1", zone: { code: "A" } },
        }),
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
          id: "batch-new",
          ...data,
        })),
      },
      inventoryTransaction: {
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          const transaction = { id: "txn-1", ...data };
          writes.push(transaction);
          return transaction;
        }),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({ id: "audit-1" }),
      },
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
    const service = new InventoryService(prisma as never, readiness as never);

    const result = await service.receiveBatch("user-1", {
      itemId: "item-1",
      shelfId: "shelf-1",
      batchCode: "LOT-2026-01",
      quantity: 20,
      expiryDate: new Date("2027-01-01"),
      note: "Nhập từ nhà tài trợ",
    });

    expect(result).toEqual(
      expect.objectContaining({
        batch: expect.objectContaining({
          id: "batch-new",
          quantity: 20,
          shelfId: "shelf-1",
        }),
        qrPayload: "safestock://inventory?sku=AO-PHAO&batch=LOT-2026-01",
      }),
    );
    expect(writes).toEqual([
      expect.objectContaining({
        batchId: "batch-new",
        type: "IMPORT",
        source: "MANUAL",
        quantity: 20,
        beforeQuantity: 0,
        afterQuantity: 20,
        quantityDelta: 20,
      }),
    ]);
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: "user-1",
        action: "INVENTORY_RECEIVE_BATCH",
        entityId: "batch-new",
      }),
    });
    expect(readiness.recalculateWarehouse).toHaveBeenCalledWith("warehouse-1");
  });

  it("rejects an existing catalog item that only belongs to another organization", async () => {
    const tx = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ organizationId: "org-1" }),
      },
      shelf: {
        findUnique: jest.fn().mockResolvedValue({
          id: "shelf-1",
          isLocked: false,
          zone: { warehouseId: "warehouse-1", warehouse: { organizationId: "org-1" } },
        }),
      },
      item: {
        findUnique: jest.fn().mockResolvedValue({
          id: "foreign-item",
          sku: "FOREIGN",
          name: "Vật tư ngoài đơn vị",
          batches: [],
        }),
      },
      itemBatch: { create: jest.fn() },
    };
    const prisma = {
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const service = new InventoryService(
      prisma as never,
      { recalculateWarehouse: jest.fn() } as never,
    );

    await expect(
      service.receiveBatch("user-1", {
        itemId: "foreign-item",
        shelfId: "shelf-1",
        batchCode: "LOT-FOREIGN",
        quantity: 1,
      }),
    ).rejects.toThrow("Không được dùng vật tư ngoài đơn vị");

    expect(tx.itemBatch.create).not.toHaveBeenCalled();
  });

  it("scopes the catalog query to the reviewer's organization", async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ organizationId: "org-1" }),
      },
      item: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const service = new InventoryService(
      prisma as never,
      { recalculateWarehouse: jest.fn() } as never,
    );

    await service.listCatalog("user-1");

    expect(prisma.item.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          batches: {
            some: {
              shelf: {
                zone: {
                  warehouse: { organizationId: "org-1" },
                },
              },
            },
          },
        },
      }),
    );
  });
});
