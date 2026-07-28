import { NotFoundException } from "@nestjs/common";
import { AdminWarehouseService } from "../admin-warehouse.service";

describe("AdminWarehouseService organization scope", () => {
  it("lists only warehouses in the actor organization", async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ organizationId: "org-1" }),
      },
      warehouse: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const service = new AdminWarehouseService(prisma as never);

    await service.listAll("admin-1");

    expect(prisma.warehouse.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: "org-1" },
      }),
    );
  });

  it("does not update a warehouse outside the actor organization", async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ organizationId: "org-1" }),
      },
      warehouse: {
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
      },
    };
    const service = new AdminWarehouseService(prisma as never);

    await expect(
      service.updateLocation("admin-1", "warehouse-org-2", 13.36, 109.03),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.warehouse.findFirst).toHaveBeenCalledWith({
      where: { id: "warehouse-org-2", organizationId: "org-1" },
    });
    expect(prisma.warehouse.update).not.toHaveBeenCalled();
  });
});
