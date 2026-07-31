import { BadRequestException } from "@nestjs/common";
import { InventoryService } from "../inventory.service";

describe("InventoryService batch pagination", () => {
  it("returns a stable next cursor without silently truncating the warehouse", async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ organizationId: "org-1" }),
      },
      warehouse: {
        findUnique: jest.fn().mockResolvedValue({ organizationId: "org-1" }),
      },
      itemBatch: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: "batch-3" }, { id: "batch-2" }, { id: "batch-1" }]),
      },
    };
    const service = new InventoryService(prisma as never, {} as never);

    await expect(
      service.listBatchesPage("warehouse-1", null, "admin-1", undefined, 2),
    ).resolves.toEqual({
      data: [{ id: "batch-3" }, { id: "batch-2" }],
      nextCursor: "batch-2",
    });
    expect(prisma.itemBatch.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 3,
      }),
    );
  });

  it("rejects a cursor that does not belong to the requested warehouse", async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ organizationId: "org-1" }),
      },
      warehouse: {
        findUnique: jest.fn().mockResolvedValue({ organizationId: "org-1" }),
      },
      itemBatch: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn(),
      },
    };
    const service = new InventoryService(prisma as never, {} as never);

    await expect(
      service.listBatchesPage("warehouse-1", null, "admin-1", "foreign-batch", 100),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.itemBatch.findMany).not.toHaveBeenCalled();
  });
});
