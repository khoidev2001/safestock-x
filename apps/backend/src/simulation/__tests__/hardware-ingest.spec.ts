import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { TelemetrySource, VirtualDeviceType } from "@prisma/client";
import { SimulationService } from "../simulation.service";
import type { HardwareTelemetryActor } from "../telemetry-actor";

describe("SimulationService — số liệu từ gateway phần cứng", () => {
  // Tương đối với đồng hồ thật: service từ chối mốc đo ở tương lai, nên mốc cố
  // định trong test sẽ hết hạn theo thời gian thực.
  const now = new Date(Date.now() - 10 * 60_000);
  const gateway: HardwareTelemetryActor = {
    source: TelemetrySource.HARDWARE,
    deviceCredentialId: "cred-1",
    deviceCode: "gateway_a",
    warehouseId: "warehouse-1",
  };
  const submission = {
    id: "submission-1",
    idempotencyKey: "hw-1",
    payloadHash: "hash",
    warehouseId: "warehouse-1",
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
    assertWarehouseAccess: jest.fn(),
    assertPermission: jest.fn(),
  };
  const service = new SimulationService(prisma as never, incidents as never, access as never);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation((callback: (tx: unknown) => unknown) =>
      callback(prisma),
    );
    prisma.sensorSubmission.findUnique.mockResolvedValue(null);
    prisma.sensorSubmission.create.mockResolvedValue(submission);
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
    prisma.sensorEvent.create.mockResolvedValue({
      id: "event-1",
      deviceId: "device-1",
      eventType: "TEMP_READING",
      value: 41,
      observedAt: now,
    });
    prisma.incident.findMany.mockResolvedValue([]);
    incidents.scanWarehouse.mockResolvedValue({
      warehouseId: "warehouse-1",
      detected: 0,
      incidents: [],
    });
  });

  const snapshot = (overrides: Record<string, unknown> = {}) => ({
    warehouseId: "warehouse-1",
    idempotencyKey: "hw-1",
    observedAt: now.toISOString(),
    readings: [{ deviceCode: "temp_A", value: 41 }],
    ...overrides,
  });

  it("ghi nguồn HARDWARE và không gán cho bất kỳ tài khoản người dùng nào", async () => {
    await service.ingestFromDevice(gateway, snapshot());

    expect(prisma.sensorSubmission.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        source: TelemetrySource.HARDWARE,
        submittedByDeviceId: "cred-1",
        submittedByUserId: null,
      }),
    });
  });

  it("đi đúng đường quét sự cố như số liệu do người vận hành xác nhận", async () => {
    // Đây là điểm mấu chốt của thiết kế: sau khi số liệu vào, không có nhánh nào
    // rẽ theo nguồn. Cảm biến thật và thanh trượt kích hoạt cùng một quy trình.
    await service.ingestFromDevice(gateway, snapshot());

    expect(incidents.scanWarehouse).toHaveBeenCalledWith(
      "warehouse-1",
      60,
      expect.objectContaining({ submissionId: "submission-1" }),
    );
  });

  it("không phụ thuộc cờ bật/tắt simulator", async () => {
    // Tắt luồng mô phỏng là chuyện của người vận hành; nó không được phép làm
    // câm cảm biến thật.
    await service.ingestFromDevice(gateway, snapshot());

    expect(access.assertMutationAccess).not.toHaveBeenCalled();
    expect(access.assertWarehouseAccess).not.toHaveBeenCalled();
  });

  it("thiết bị không gửi được số liệu sang kho khác", async () => {
    await expect(
      service.ingestFromDevice(gateway, snapshot({ warehouseId: "warehouse-2" })),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("giữ mốc đo riêng và độ tin cậy của từng cảm biến", async () => {
    const readingObservedAt = new Date(now.getTime() - 30_000).toISOString();

    await service.ingestFromDevice(
      gateway,
      snapshot({
        readings: [
          { deviceCode: "temp_A", value: 41, observedAt: readingObservedAt, quality: 0.4 },
        ],
      }),
    );

    expect(prisma.sensorEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        quality: 0.4,
        observedAt: new Date(readingObservedAt),
      }),
    });
  });

  it("từ chối độ tin cậy ngoài khoảng 0..1", async () => {
    await expect(
      service.ingestFromDevice(
        gateway,
        snapshot({ readings: [{ deviceCode: "temp_A", value: 41, quality: 1.5 }] }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("từ chối mốc đo của cảm biến nằm sau mốc của cả lô", async () => {
    // Vẫn là quá khứ so với đồng hồ thật, nhưng muộn hơn mốc chung của lô quá
    // mức cho phép — lỗi phải đến từ ràng buộc này, không phải ràng buộc tương lai.
    const future = new Date(now.getTime() + 6 * 60_000).toISOString();

    await expect(
      service.ingestFromDevice(
        gateway,
        snapshot({ readings: [{ deviceCode: "temp_A", value: 41, observedAt: future }] }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("cập nhật mốc nhận tin cuối, nhưng không kéo lùi khi gửi bù dữ liệu cũ", async () => {
    await service.ingestFromDevice(gateway, snapshot());

    expect(prisma.virtualDevice.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: { in: ["device-1"] },
        OR: [{ lastSeenAt: null }, { lastSeenAt: { lt: now } }],
      }),
      data: { lastSeenAt: now, online: true },
    });
  });

  it("nhiều cảm biến chung một mốc chỉ tốn một câu lệnh cập nhật heartbeat", async () => {
    // Gateway thật gửi hàng chục cảm biến mỗi lô; mỗi thiết bị một câu lệnh sẽ
    // làm transaction phình ra vô cớ.
    prisma.virtualDevice.findMany.mockResolvedValue([
      {
        id: "device-1",
        code: "temp_A",
        type: VirtualDeviceType.TEMPERATURE,
        unit: "°C",
        zoneId: "z",
      },
      {
        id: "device-2",
        code: "temp_B",
        type: VirtualDeviceType.TEMPERATURE,
        unit: "°C",
        zoneId: "z",
      },
      {
        id: "device-3",
        code: "temp_C",
        type: VirtualDeviceType.TEMPERATURE,
        unit: "°C",
        zoneId: "z",
      },
    ]);

    await service.ingestFromDevice(
      gateway,
      snapshot({
        readings: [
          { deviceCode: "temp_A", value: 20 },
          { deviceCode: "temp_B", value: 21 },
          { deviceCode: "temp_C", value: 22 },
        ],
      }),
    );

    expect(prisma.virtualDevice.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.virtualDevice.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ id: { in: ["device-1", "device-2", "device-3"] } }),
      data: { lastSeenAt: now, online: true },
    });
  });

  it("phát lại khoá chống trùng của kho khác vẫn bị chặn", async () => {
    // Kiểm tra chủ thể đã được nới từ 'ai gửi' sang 'thuộc kho nào'; ranh giới
    // kho là thứ không được nới theo.
    prisma.sensorSubmission.findUnique.mockResolvedValue({
      ...submission,
      warehouseId: "warehouse-khac",
    });

    await expect(service.ingestFromDevice(gateway, snapshot())).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("gửi lại đúng lô cũ không tạo bản ghi trùng", async () => {
    prisma.sensorSubmission.findUnique.mockResolvedValue({
      ...submission,
      payloadHash: hashOf("warehouse-1", now, [{ deviceCode: "temp_A", value: 41 }]),
    });

    await expect(service.ingestFromDevice(gateway, snapshot())).resolves.toEqual(
      expect.objectContaining({ accepted: true, duplicate: true, events: [] }),
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

/** Lặp lại đúng công thức chữ ký payload của service để kiểm chứng tính tương thích. */
function hashOf(
  warehouseId: string,
  observedAt: Date,
  readings: { deviceCode: string; value: number }[],
): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createHash } = require("crypto") as typeof import("crypto");
  return createHash("sha256")
    .update(JSON.stringify({ warehouseId, observedAt: observedAt.toISOString(), readings }))
    .digest("hex");
}
