import { SimulationService } from "../simulation.service";

/**
 * emit() phải gộp nhiều event liên tiếp thành 1 lần quét sự cố (debounce 1200ms),
 * để burst của 1 lần chỉnh/1 scenario không gọi scanWarehouse dồn dập.
 */
describe("SimulationService — debounce quét sự cố", () => {
  const prisma = {
    $transaction: jest.fn((callback: (tx: unknown) => unknown) => callback(prisma)),
    $queryRaw: jest.fn(),
    virtualDevice: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    sensorEvent: {
      create: jest.fn(),
    },
  };
  const access = { assertMutationAccess: jest.fn().mockResolvedValue({}) };
  // SMOKE: không thuộc ENV_DEVICE_TYPES và không phải LOADCELL → chỉ kích incident scan,
  // cô lập hành vi debounce khỏi readiness recalc/giao dịch loadcell.
  const smokeDevice = {
    id: "device-smoke",
    type: "SMOKE",
    currentValue: 0,
    zoneId: "zone-1",
    unit: "ppm",
    shelfId: null,
  };
  const incidents = { scanWarehouse: jest.fn().mockResolvedValue({ detected: 0 }) };
  const service = new SimulationService(
    prisma as never,
    {} as never,
    {} as never,
    incidents as never,
    access as never,
    {} as never,
  );

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation((callback: (tx: unknown) => unknown) =>
      callback(prisma),
    );
    prisma.virtualDevice.findUnique.mockResolvedValue(smokeDevice);
    prisma.virtualDevice.update.mockResolvedValue(smokeDevice);
    prisma.sensorEvent.create.mockResolvedValue({ id: "event-1" });
  });

  afterEach(() => jest.useRealTimers());

  it("gộp 3 event liên tiếp thành 1 lần scanWarehouse", async () => {
    for (let i = 0; i < 3; i++) {
      await service.emit("admin-1", {
        warehouseId: "warehouse-central",
        deviceCode: "smoke_main",
        eventType: "SMOKE_READING",
        value: 35,
      });
    }

    // Chưa tới hạn debounce → chưa scan.
    expect(incidents.scanWarehouse).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1200);

    expect(incidents.scanWarehouse).toHaveBeenCalledTimes(1);
    expect(incidents.scanWarehouse).toHaveBeenCalledWith("warehouse-central");
  });

  it("không quét khi event bị lọc vì delta nhỏ (dưới ngưỡng)", async () => {
    // SMOKE delta ngưỡng = 5; đổi từ 0 → 3 là không đáng kể → không lưu, không scan.
    prisma.virtualDevice.findUnique.mockResolvedValue({ ...smokeDevice, currentValue: 0 });
    await service.emit("admin-1", {
      warehouseId: "warehouse-central",
      deviceCode: "smoke_main",
      eventType: "SMOKE_READING",
      value: 3,
    });

    jest.advanceTimersByTime(1200);

    expect(prisma.sensorEvent.create).not.toHaveBeenCalled();
    expect(incidents.scanWarehouse).not.toHaveBeenCalled();
  });
});
