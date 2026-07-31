import { ForbiddenException } from "@nestjs/common";
import { SimulationService } from "../simulation.service";

describe("SimulationService — tắt chuông", () => {
  // Tương đối với đồng hồ thật: mốc xác nhận ở tương lai bị service từ chối.
  const now = new Date(Date.now() - 60_000);
  const prisma = {
    sensorSubmission: { findUnique: jest.fn(), create: jest.fn() },
    virtualDevice: { findMany: jest.fn(), updateMany: jest.fn() },
    sensorEvent: { create: jest.fn() },
    incident: { findMany: jest.fn() },
    incidentAction: { createMany: jest.fn() },
    $transaction: jest.fn(),
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
    access.assertAlarmAccess.mockResolvedValue({ userId: "warehouse-staff-1" });
    prisma.incidentAction.createMany.mockResolvedValue({ count: 1 });
  });

  it("tắt chuông không đi qua cổng quyền của luồng mô phỏng", async () => {
    // Cờ tắt simulator không được phép làm chuông thật không tắt được — chuông
    // không tắt được là chuông sẽ bị rút điện.
    prisma.incident.findMany.mockResolvedValue([{ id: "incident-1" }]);

    await service.acknowledgeAlarm("warehouse-staff-1", ack({ incidentIds: ["incident-1"] }));

    expect(access.assertMutationAccess).not.toHaveBeenCalled();
    expect(access.assertAlarmAccess).toHaveBeenCalledWith("warehouse-staff-1", "warehouse-1");
  });

  const ack = (overrides: Record<string, unknown> = {}) => ({
    warehouseId: "warehouse-1",
    acknowledgementKey: "alarm-ack-1",
    acknowledgedAt: now.toISOString(),
    ...overrides,
  });

  it("người có quyền trên kho tắt được chuông do THIẾT BỊ kích hoạt", async () => {
    // Trước đây chỉ người gửi lô số liệu mới tắt được chuông của lô đó. Với cảm
    // biến thật, người gửi là cái cảm biến — nên sẽ không còn ai tắt được chuông.
    prisma.sensorSubmission.findUnique.mockResolvedValue({
      id: "submission-1",
      warehouseId: "warehouse-1",
    });
    prisma.incident.findMany.mockResolvedValue([{ id: "incident-1" }]);

    await expect(
      service.acknowledgeAlarm("warehouse-staff-1", ack({ submissionKey: "hw-1" })),
    ).resolves.toEqual({ pending: false, acknowledgedIncidentIds: ["incident-1"] });
  });

  it("tắt được chuông theo id sự cố nhận qua realtime", async () => {
    prisma.incident.findMany.mockResolvedValue([{ id: "incident-9" }]);

    await expect(
      service.acknowledgeAlarm("warehouse-staff-1", ack({ incidentIds: ["incident-9"] })),
    ).resolves.toEqual({ pending: false, acknowledgedIncidentIds: ["incident-9"] });

    // Truy vấn luôn bị giới hạn trong đúng kho đã qua kiểm tra quyền.
    expect(prisma.incident.findMany).toHaveBeenCalledWith({
      where: { id: { in: ["incident-9"] }, warehouseId: "warehouse-1" },
      select: { id: true },
    });
    expect(prisma.sensorSubmission.findUnique).not.toHaveBeenCalled();
  });

  it("id sự cố của kho khác bị lọc bỏ, không tắt nhầm chuông kho bạn", async () => {
    prisma.incident.findMany.mockResolvedValue([]);

    await expect(
      service.acknowledgeAlarm(
        "warehouse-staff-1",
        ack({ incidentIds: ["incident-cua-kho-khac"] }),
      ),
    ).resolves.toEqual({ pending: false, acknowledgedIncidentIds: [] });
    expect(prisma.incidentAction.createMany).not.toHaveBeenCalled();
  });

  it("lô số liệu chưa lên tới server thì giữ trong hàng chờ, không mất xác nhận", async () => {
    prisma.sensorSubmission.findUnique.mockResolvedValue(null);

    await expect(
      service.acknowledgeAlarm("warehouse-staff-1", ack({ submissionKey: "chua-gui" })),
    ).resolves.toEqual({ pending: true, acknowledgedIncidentIds: [] });
  });

  it("lô số liệu thuộc kho khác vẫn bị từ chối", async () => {
    prisma.sensorSubmission.findUnique.mockResolvedValue({
      id: "submission-1",
      warehouseId: "warehouse-khac",
    });

    await expect(
      service.acknowledgeAlarm("warehouse-staff-1", ack({ submissionKey: "hw-1" })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("ghi hành động tắt chuông theo khoá chống trùng của từng sự cố", async () => {
    prisma.incident.findMany.mockResolvedValue([{ id: "incident-1" }, { id: "incident-2" }]);

    await service.acknowledgeAlarm(
      "warehouse-staff-1",
      ack({ incidentIds: ["incident-1", "incident-2"] }),
    );

    expect(prisma.incidentAction.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          incidentId: "incident-1",
          idempotencyKey: "alarm-ack-1:incident-1",
        }),
        expect.objectContaining({
          incidentId: "incident-2",
          idempotencyKey: "alarm-ack-1:incident-2",
        }),
      ],
      skipDuplicates: true,
    });
  });
});
