import { SimulationService } from "../simulation.service";

describe("SimulationService.firstWarehouse", () => {
  const prisma = {
    warehouse: {
      findFirst: jest.fn(),
    },
  };
  const access = { assertPermission: jest.fn() };
  const service = new SimulationService(
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
    access as never,
    {} as never,
  );

  beforeEach(() => jest.clearAllMocks());

  it("mở đúng kho được gán cho tài khoản kho thôn", async () => {
    access.assertPermission.mockResolvedValue({
      userId: "user-warehouse",
      organizationId: "organization-1",
      role: "WAREHOUSE",
      warehouseId: "warehouse-assigned",
    });
    prisma.warehouse.findFirst.mockResolvedValue({ id: "warehouse-assigned", name: "Kho thôn" });

    await service.firstWarehouse("user-warehouse");

    expect(prisma.warehouse.findFirst).toHaveBeenCalledWith({
      where: { id: "warehouse-assigned", organizationId: "organization-1" },
      select: { id: true, name: true },
    });
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
