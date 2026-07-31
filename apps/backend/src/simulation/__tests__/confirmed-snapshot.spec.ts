import { createHash } from "crypto";
import { BadRequestException } from "@nestjs/common";
import { VirtualDeviceType } from "@prisma/client";
import { SimulationService } from "../simulation.service";

describe("SimulationService confirmed snapshots", () => {
  const now = new Date("2026-07-30T08:00:00.000Z");
  const readings = [{ deviceCode: "temp_A", value: 36 }];
  const payloadHash = createHash("sha256")
    .update(
      JSON.stringify({
        warehouseId: "warehouse-1",
        observedAt: now.toISOString(),
        readings,
      }),
    )
    .digest("hex");
  const submission = {
    id: "submission-1",
    idempotencyKey: "snapshot-1",
    payloadHash,
    warehouseId: "warehouse-1",
    submittedByUserId: "admin-1",
    observedAt: now,
    receivedAt: now,
    policyVersion: "2026-07-30.1",
  };
  const prisma = {
    sensorSubmission: { findUnique: jest.fn(), create: jest.fn() },
    virtualDevice: { findMany: jest.fn(), updateMany: jest.fn() },
    sensorEvent: { create: jest.fn() },
    incident: { findMany: jest.fn() },
    incidentAction: { createMany: jest.fn() },
    $transaction: jest.fn((callback: (tx: unknown) => unknown) => callback(prisma)),
  };
  const incidents = { scanWarehouse: jest.fn() };
  const access = {
    assertMutationAccess: jest.fn(),
    assertAlarmAccess: jest.fn(),
    assertWarehouseAccess: jest.fn(),
    assertPermission: jest.fn(),
  };
  const service = new SimulationService(prisma as never, incidents as never, access as never);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation((callback: (tx: unknown) => unknown) =>
      callback(prisma),
    );
    access.assertMutationAccess.mockResolvedValue({ userId: "admin-1" });
    access.assertAlarmAccess.mockResolvedValue({ userId: "admin-1" });
    prisma.sensorSubmission.findUnique.mockResolvedValue(null);
    prisma.virtualDevice.findMany.mockResolvedValue([
      {
        id: "device-1",
        code: "temp_A",
        type: VirtualDeviceType.TEMPERATURE,
        unit: "°C",
        zoneId: "zone-1",
      },
    ]);
    prisma.virtualDevice.updateMany.mockResolvedValue({ count: 1 });
    prisma.sensorSubmission.create.mockResolvedValue(submission);
    prisma.sensorEvent.create.mockResolvedValue({
      id: "event-1",
      deviceId: "device-1",
      eventType: "TEMP_READING",
      value: 36,
      observedAt: now,
    });
    prisma.incident.findMany.mockResolvedValue([]);
    incidents.scanWarehouse.mockResolvedValue({
      warehouseId: "warehouse-1",
      detected: 0,
      incidents: [],
    });
  });

  it("writes one confirmed event with a server-derived event type", async () => {
    const result = await service.submit("admin-1", {
      warehouseId: "warehouse-1",
      idempotencyKey: "snapshot-1",
      observedAt: now.toISOString(),
      readings,
    });

    expect(prisma.sensorEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        submissionId: "submission-1",
        deviceId: "device-1",
        eventType: "TEMP_READING",
        value: 36,
        observedAt: now,
      }),
    });
    expect(incidents.scanWarehouse).toHaveBeenCalledWith(
      "warehouse-1",
      60,
      expect.objectContaining({ submissionId: "submission-1" }),
    );
    expect(result).toEqual(expect.objectContaining({ accepted: true, duplicate: false }));
  });

  it("returns the committed winner for an identical idempotent replay", async () => {
    prisma.sensorSubmission.findUnique.mockResolvedValue(submission);

    await expect(
      service.submit("admin-1", {
        warehouseId: "warehouse-1",
        idempotencyKey: "snapshot-1",
        observedAt: now.toISOString(),
        readings,
      }),
    ).resolves.toEqual(expect.objectContaining({ accepted: true, duplicate: true, events: [] }));

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(incidents.scanWarehouse).not.toHaveBeenCalled();
  });

  it("rejects duplicate device codes before any database write", async () => {
    await expect(
      service.submit("admin-1", {
        warehouseId: "warehouse-1",
        idempotencyKey: "snapshot-1",
        observedAt: now.toISOString(),
        readings: [
          { deviceCode: "temp_A", value: 36 },
          { deviceCode: "temp_A", value: 37 },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("persists a manual bell acknowledgement idempotently after its snapshot exists", async () => {
    prisma.sensorSubmission.findUnique.mockResolvedValue({
      id: "submission-1",
      warehouseId: "warehouse-1",
      submittedByUserId: "admin-1",
    });
    prisma.incident.findMany.mockResolvedValue([{ id: "incident-1" }]);
    prisma.incidentAction.createMany.mockResolvedValue({ count: 1 });

    await expect(
      service.acknowledgeAlarm("admin-1", {
        warehouseId: "warehouse-1",
        submissionKey: "snapshot-1",
        acknowledgementKey: "alarm-ack-1",
        acknowledgedAt: now.toISOString(),
      }),
    ).resolves.toEqual({ pending: false, acknowledgedIncidentIds: ["incident-1"] });

    expect(prisma.incidentAction.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          incidentId: "incident-1",
          action: "ALARM_ACKNOWLEDGED",
          actorId: "admin-1",
          idempotencyKey: "alarm-ack-1:incident-1",
        }),
      ],
      skipDuplicates: true,
    });
  });
});
