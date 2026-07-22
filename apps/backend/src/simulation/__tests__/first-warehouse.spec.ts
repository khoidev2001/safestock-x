import { SimulationService } from "../simulation.service";

describe("SimulationService.firstWarehouse", () => {
  const prisma = {
    user: {
      findUnique: jest.fn(),
    },
    warehouse: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
  };
  const service = new SimulationService(
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
  );

  beforeEach(() => jest.clearAllMocks());

  it("mở đúng kho được gán cho tài khoản kho thôn", async () => {
    await service.firstWarehouse("user-warehouse", "warehouse-assigned");

    expect(prisma.warehouse.findUnique).toHaveBeenCalledWith({
      where: { id: "warehouse-assigned" },
      select: { id: true, name: true },
    });
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("mở kho trung tâm thuộc đúng đơn vị của tài khoản toàn xã", async () => {
    prisma.user.findUnique.mockResolvedValue({ organizationId: "organization-2" });

    await service.firstWarehouse("admin-2", null);

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: "admin-2" },
      select: { organizationId: true },
    });

    expect(prisma.warehouse.findFirst).toHaveBeenCalledWith({
      where: { kind: "CENTRAL", organizationId: "organization-2" },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true },
    });
  });
});
