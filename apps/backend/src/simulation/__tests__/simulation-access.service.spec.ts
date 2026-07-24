import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { Permission, UserRole } from "@safestock/shared-types";
import { SimulationAccessService } from "../simulation-access.service";

describe("SimulationAccessService", () => {
  const prisma = {
    user: { findUnique: jest.fn() },
    warehouse: { findUnique: jest.fn() },
  };
  const config = { get: jest.fn() };
  const service = new SimulationAccessService(prisma as never, config as never);

  beforeEach(() => jest.clearAllMocks());

  it.each([undefined, "", "false", "FALSE", false])(
    "chặn mutation khi flag=%p trước khi đọc actor",
    async (value) => {
      config.get.mockReturnValue(value);

      await expect(service.assertMutationAccess("admin-1", "warehouse-1")).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
      expect(prisma.warehouse.findUnique).not.toHaveBeenCalled();
    },
  );

  it("cho ADMIN hiện tại truy cập kho cùng organization khi flag bật", async () => {
    config.get.mockReturnValue("TRUE");
    prisma.user.findUnique.mockResolvedValue({
      id: "admin-1",
      organizationId: "org-1",
      role: UserRole.ADMIN,
      warehouseId: null,
    });
    prisma.warehouse.findUnique.mockResolvedValue({ organizationId: "org-1" });

    await expect(service.assertMutationAccess("admin-1", "warehouse-1")).resolves.toMatchObject({
      userId: "admin-1",
      organizationId: "org-1",
    });
  });

  it("chặn token ADMIN cũ khi role hiện tại đã bị hạ", async () => {
    config.get.mockReturnValue("true");
    prisma.user.findUnique.mockResolvedValue({
      id: "user-1",
      organizationId: "org-1",
      role: UserRole.WAREHOUSE,
      warehouseId: "warehouse-1",
    });

    await expect(service.assertMutationAccess("user-1", "warehouse-1")).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.warehouse.findUnique).not.toHaveBeenCalled();
  });

  it("chặn actor kho A đọc kho B", async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: "warehouse-user",
      organizationId: "org-1",
      role: UserRole.WAREHOUSE,
      warehouseId: "warehouse-a",
    });
    prisma.warehouse.findUnique.mockResolvedValue({ organizationId: "org-1" });

    await expect(
      service.assertWarehouseAccess("warehouse-user", "warehouse-b", Permission.SIMULATION_VIEW),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("chặn actor toàn xã truy cập organization khác", async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: "admin-1",
      organizationId: "org-1",
      role: UserRole.ADMIN,
      warehouseId: null,
    });
    prisma.warehouse.findUnique.mockResolvedValue({ organizationId: "org-2" });

    await expect(
      service.assertWarehouseAccess("admin-1", "warehouse-2", Permission.SIMULATION_VIEW),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("chặn user đã bị xóa", async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(
      service.assertPermission("deleted-user", Permission.SIMULATION_VIEW),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
