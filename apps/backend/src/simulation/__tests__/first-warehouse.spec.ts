import { SimulationService } from "../simulation.service";

describe("SimulationService.firstWarehouse", () => {
  const prisma = {
    warehouse: {
      findFirst: jest.fn(),
    },
    virtualDevice: {
      findMany: jest.fn(),
    },
  };
  const access = {
    assertPermission: jest.fn(),
    assertWarehouseAccess: jest.fn(),
  };
  const service = new SimulationService(prisma as never, {} as never, access as never);

  beforeEach(() => jest.clearAllMocks());

  it("vẫn mở kho được gán để tài khoản kho thôn dùng nghiệp vụ web/mobile", async () => {
    access.assertPermission.mockResolvedValue({
      userId: "user-warehouse",
      organizationId: "organization-1",
      role: "WAREHOUSE",
      warehouseId: "warehouse-assigned",
    });
    prisma.warehouse.findFirst.mockResolvedValue({ id: "warehouse-assigned", name: "Kho thôn" });

    await expect(service.firstWarehouse("user-warehouse")).resolves.toEqual({
      id: "warehouse-assigned",
      name: "Kho thôn",
    });

    expect(prisma.warehouse.findFirst).toHaveBeenCalledWith({
      where: { id: "warehouse-assigned", organizationId: "organization-1" },
      select: { id: true, name: true },
    });
  });

  it("trả danh sách thiết bị rỗng cho kho thôn thay vì làm hỏng dashboard", async () => {
    access.assertWarehouseAccess.mockResolvedValue({
      warehouseKind: "HAMLET",
    });

    await expect(service.listDevices("warehouse-user", "warehouse-hamlet")).resolves.toEqual([]);

    expect(prisma.virtualDevice.findMany).not.toHaveBeenCalled();
  });

  it("mở kho trung tâm thuộc đúng đơn vị của tài khoản toàn xã", async () => {
    access.assertPermission.mockResolvedValue({
      userId: "admin-2",
      organizationId: "organization-2",
      role: "ADMIN",
      warehouseId: null,
    });

    await service.firstWarehouse("admin-2");

    expect(prisma.warehouse.findFirst).toHaveBeenCalledWith({
      where: { kind: "CENTRAL", organizationId: "organization-2" },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true },
    });
  });
});
