import { ForbiddenException } from "@nestjs/common";
import { TransactionSource, VirtualDeviceType } from "@prisma/client";
import { SimulationService } from "../simulation.service";

describe("SimulationService isolation", () => {
  const prisma = {
    $transaction: jest.fn((callback: (tx: unknown) => unknown) => callback(prisma)),
    $queryRaw: jest.fn(),
    virtualDevice: {
      findUnique: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
    sensorEvent: { create: jest.fn(), findMany: jest.fn() },
    itemBatch: { findFirst: jest.fn() },
  };
  const inventory = {
    exportInTx: jest.fn(),
    importInTx: jest.fn(),
    recalcBatches: jest.fn().mockResolvedValue(undefined),
  };
  const access = {
    assertMutationAccess: jest.fn(),
    assertWarehouseAccess: jest.fn(),
  };
  const systemActors = { getActorId: jest.fn() };
  const incidents = { scanWarehouse: jest.fn().mockResolvedValue({ detected: 0 }) };
  const service = new SimulationService(
    prisma as never,
    {} as never,
    inventory as never,
    incidents as never,
    access as never,
    systemActors as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation((callback: (tx: unknown) => unknown) =>
      callback(prisma),
    );
    inventory.recalcBatches.mockResolvedValue(undefined);
  });

  it("direct emit bị chặn trước mọi write", async () => {
    access.assertMutationAccess.mockRejectedValue(new ForbiddenException());

    await expect(
      service.emit("user-1", {
        warehouseId: "warehouse-1",
        deviceCode: "temp-a",
        eventType: "TEMPERATURE_READING",
        value: 30,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.virtualDevice.findUnique).not.toHaveBeenCalled();
    expect(prisma.virtualDevice.update).not.toHaveBeenCalled();
    expect(prisma.sensorEvent.create).not.toHaveBeenCalled();
    expect(inventory.exportInTx).not.toHaveBeenCalled();
    expect(inventory.importInTx).not.toHaveBeenCalled();
  });

  it("loadcell dùng actor hệ thống và exact warehouse scope", async () => {
    access.assertMutationAccess.mockResolvedValue({});
    prisma.virtualDevice.findUnique.mockResolvedValue({
      id: "device-loadcell",
      warehouseId: "warehouse-1",
      code: "loadcell-a",
      type: VirtualDeviceType.LOADCELL,
      currentValue: 10,
      zoneId: "zone-1",
      unit: "kg",
      shelfId: "shelf-1",
      shelf: { zone: { warehouseId: "warehouse-1" } },
    });
    prisma.itemBatch.findFirst.mockResolvedValue({
      id: "batch-1",
      item: { unitWeightKg: 1 },
    });
    systemActors.getActorId.mockResolvedValue("system-actor-1");
    prisma.virtualDevice.update.mockResolvedValue({});
    prisma.sensorEvent.create.mockResolvedValue({ id: "event-1" });

    await service.emit("admin-1", {
      warehouseId: "warehouse-1",
      deviceCode: "loadcell-a",
      eventType: "WEIGHT_READING",
      value: 8,
    });

    expect(inventory.exportInTx).toHaveBeenCalledWith(
      prisma,
      "system-actor-1",
      "batch-1",
      2,
      "Tự động từ loadcell",
      TransactionSource.LOADCELL,
      "warehouse-1",
    );
    expect(inventory.importInTx).not.toHaveBeenCalled();
    expect(inventory.recalcBatches).toHaveBeenCalledWith(["batch-1"]);
  });

  it("từ chối device/shelf lệch kho trước inventory và device write", async () => {
    access.assertMutationAccess.mockResolvedValue({});
    prisma.virtualDevice.findUnique.mockResolvedValue({
      id: "device-loadcell",
      warehouseId: "warehouse-1",
      code: "loadcell-a",
      type: VirtualDeviceType.LOADCELL,
      currentValue: 10,
      zoneId: "zone-1",
      unit: "kg",
      shelfId: "shelf-2",
      shelf: { zone: { warehouseId: "warehouse-2" } },
    });

    await expect(
      service.emit("admin-1", {
        warehouseId: "warehouse-1",
        deviceCode: "loadcell-a",
        eventType: "WEIGHT_READING",
        value: 8,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(systemActors.getActorId).not.toHaveBeenCalled();
    expect(inventory.exportInTx).not.toHaveBeenCalled();
    expect(prisma.virtualDevice.update).not.toHaveBeenCalled();
  });

  it("loadcell tăng cân dùng import trong cùng transaction và exact scope", async () => {
    access.assertMutationAccess.mockResolvedValue({});
    prisma.virtualDevice.findUnique.mockResolvedValue({
      id: "device-loadcell",
      warehouseId: "warehouse-1",
      code: "loadcell-a",
      type: VirtualDeviceType.LOADCELL,
      currentValue: 8,
      zoneId: "zone-1",
      unit: "kg",
      shelfId: "shelf-1",
      shelf: { zone: { warehouseId: "warehouse-1" } },
    });
    prisma.itemBatch.findFirst.mockResolvedValue({
      id: "batch-1",
      item: { unitWeightKg: 1 },
    });
    systemActors.getActorId.mockResolvedValue("system-actor-1");
    prisma.virtualDevice.update.mockResolvedValue({});
    prisma.sensorEvent.create.mockResolvedValue({ id: "event-1" });

    await service.emit("admin-1", {
      warehouseId: "warehouse-1",
      deviceCode: "loadcell-a",
      eventType: "WEIGHT_READING",
      value: 10,
    });

    expect(inventory.importInTx).toHaveBeenCalledWith(
      prisma,
      "system-actor-1",
      "batch-1",
      2,
      "Tự động từ loadcell",
      TransactionSource.LOADCELL,
      "warehouse-1",
    );
    expect(inventory.exportInTx).not.toHaveBeenCalled();
  });

  it("device, inventory và event dùng cùng transaction boundary", async () => {
    access.assertMutationAccess.mockResolvedValue({});
    prisma.virtualDevice.findUnique.mockResolvedValue({
      id: "device-loadcell",
      warehouseId: "warehouse-1",
      code: "loadcell-a",
      type: VirtualDeviceType.LOADCELL,
      currentValue: 10,
      zoneId: "zone-1",
      unit: "kg",
      shelfId: "shelf-1",
      shelf: { zone: { warehouseId: "warehouse-1" } },
    });
    prisma.itemBatch.findFirst.mockResolvedValue({ id: "batch-1", item: { unitWeightKg: 1 } });
    systemActors.getActorId.mockResolvedValue("system-actor-1");
    prisma.sensorEvent.create.mockRejectedValue(new Error("forced event failure"));

    await expect(
      service.emit("admin-1", {
        warehouseId: "warehouse-1",
        deviceCode: "loadcell-a",
        eventType: "WEIGHT_READING",
        value: 8,
      }),
    ).rejects.toThrow("forced event failure");

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(inventory.exportInTx).toHaveBeenCalledWith(
      prisma,
      expect.any(String),
      "batch-1",
      2,
      expect.any(String),
      TransactionSource.LOADCELL,
      "warehouse-1",
    );
    expect(inventory.recalcBatches).not.toHaveBeenCalled();
  });
});
