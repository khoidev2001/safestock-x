import { SimulationService } from "../simulation.service";

describe("SimulationService.firstWarehouse", () => {
  const prisma = {
    warehouse: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
  };
  const service = new SimulationService(prisma as never, {} as never, {} as never);

  beforeEach(() => jest.clearAllMocks());

  it("mở đúng kho được gán cho tài khoản kho thôn", async () => {
    await service.firstWarehouse("warehouse-assigned");

    expect(prisma.warehouse.findUnique).toHaveBeenCalledWith({
      where: { id: "warehouse-assigned" },
      select: { id: true, name: true },
    });
  });

  it("mặc định mở kho trung tâm cho tài khoản toàn xã", async () => {
    await service.firstWarehouse(null);

    expect(prisma.warehouse.findFirst).toHaveBeenCalledWith({
      where: { kind: "CENTRAL" },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true },
    });
  });
});
