import {
  MissionStatus,
  MissionWarehouseRequestStatus,
  NotificationKind,
  ReportProcessingState,
  UserRole,
} from "@prisma/client";
import { IncidentType } from "@safestock/shared-types";
import { MissionService } from "../mission.service";

const reporter = {
  id: "reporter-a",
  organizationId: "org-a",
  role: UserRole.REPORTER,
  warehouseId: "warehouse-a",
};

function serviceWith(overrides: Record<string, unknown> = {}) {
  const mission = {
    create: jest.fn().mockResolvedValue({ id: "mission-original" }),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    findMany: jest.fn().mockResolvedValue([]),
    findFirst: jest.fn().mockResolvedValue(null),
    ...((overrides.mission as object | undefined) ?? {}),
  };
  const missionAudio = {
    create: jest.fn().mockResolvedValue({ id: "audio-a" }),
    findUnique: jest.fn().mockResolvedValue(null),
    ...((overrides.missionAudio as object | undefined) ?? {}),
  };
  const user = {
    findUnique: jest.fn().mockResolvedValue(reporter),
    ...((overrides.user as object | undefined) ?? {}),
  };
  const warehouse = {
    findFirst: jest.fn().mockResolvedValue({
      id: "warehouse-a",
      communeId: "commune-a",
      organizationId: "org-a",
    }),
    findMany: jest.fn().mockResolvedValue([{ id: "warehouse-a" }]),
    ...((overrides.warehouse as object | undefined) ?? {}),
  };
  const missionRequirement = {
    findMany: jest.fn().mockResolvedValue([]),
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    createMany: jest.fn().mockResolvedValue({ count: 0 }),
  };
  const missionWarehouseRequest = {
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    createMany: jest.fn().mockResolvedValue({ count: 0 }),
  };
  const tx = { mission, missionAudio, missionRequirement, missionWarehouseRequest, user, warehouse };
  const prisma = {
    ...tx,
    $transaction: jest.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
  };
  const notifications = { create: jest.fn().mockResolvedValue({}) };
  const service = new MissionService(
    prisma as never,
    {} as never,
    {} as never,
    notifications as never,
    {} as never,
    {} as never,
  );
  return {
    service,
    prisma,
    tx,
    mission,
    missionAudio,
    missionRequirement,
    user,
    warehouse,
    notifications,
  };
}

function pcmWavBase64(): string {
  const bytes = Buffer.alloc(46);
  bytes.write("RIFF", 0, "ascii");
  bytes.writeUInt32LE(38, 4);
  bytes.write("WAVE", 8, "ascii");
  bytes.write("fmt ", 12, "ascii");
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(16_000, 24);
  bytes.writeUInt32LE(32_000, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write("data", 36, "ascii");
  bytes.writeUInt32LE(2, 40);
  return bytes.toString("base64");
}

describe("MissionService reporter contracts", () => {
  it("tạo Mission và original WAV trong cùng transaction rồi trả đúng Mission ID", async () => {
    const state = serviceWith();

    await expect(state.service.submitReport("reporter-a", {
      description: "Nước đang dâng nhanh tại khu dân cư",
      audioBase64: pcmWavBase64(),
      mimeType: "audio/wav",
    })).resolves.toEqual({ missionId: "mission-original" });

    expect(state.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(state.mission.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        createdByUserId: "reporter-a",
        reportProcessingState: ReportProcessingState.SUBMITTED,
        status: MissionStatus.DRAFT,
      }),
    }));
    expect(state.missionAudio.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ missionId: "mission-original", mimeType: "audio/wav" }),
    });
    expect(state.notifications.create).toHaveBeenCalledWith(expect.objectContaining({
      missionId: "mission-original",
      organizationId: "org-a",
    }));
  });

  it("reloads the REPORTER and warehouse scope inside the atomic submission transaction", async () => {
    const state = serviceWith();

    await state.service.submitReport("reporter-a", {
      description: "Nước đang dâng nhanh tại khu dân cư",
    });

    expect(state.user.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "reporter-a" },
    }));
    expect(state.warehouse.findFirst).toHaveBeenCalledWith({
      where: { id: "warehouse-a", organizationId: "org-a" },
    });
    expect(state.prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it("persists trimmed concrete location in the same Mission transaction", async () => {
    const state = serviceWith();

    await state.service.submitReport("reporter-a", {
      description: "Nước đang dâng nhanh tại khu dân cư",
      location: "  gần cầu tràn  ",
    });

    expect(state.mission.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ location: "gần cầu tràn" }),
      }),
    );
  });

  it("own detail dùng đồng thời actor, organization hiện tại và Mission ID", async () => {
    const state = serviceWith();

    await expect(state.service.getOwnReport("reporter-a", "mission-foreign")).rejects.toThrow(
      "Không tìm thấy báo cáo",
    );

    expect(state.mission.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: "mission-foreign",
        createdByUserId: "reporter-a",
        warehouseId: { in: ["warehouse-a"] },
      }),
    }));
  });

  it("generic actor warehouse scope của REPORTER không mở rộng ra toàn organization", async () => {
    const state = serviceWith({
      warehouse: { findMany: jest.fn().mockResolvedValue([{ id: "warehouse-a" }]) },
    });
    const scoped = state.service as unknown as {
      actorWarehouseIds(actor: typeof reporter): Promise<string[]>;
    };

    await expect(scoped.actorWarehouseIds(reporter)).resolves.toEqual(["warehouse-a"]);

    expect(state.warehouse.findMany).toHaveBeenCalledWith({
      where: { organizationId: "org-a", id: "warehouse-a" },
      select: { id: true },
    });
  });

  it("audio chỉ đọc bằng ADMIN database-current trong organization hiện tại", async () => {
    const state = serviceWith({
      user: {
        findUnique: jest.fn().mockResolvedValue({ ...reporter, id: "admin-a", role: UserRole.ADMIN, warehouseId: null }),
      },
    });

    await expect(state.service.getReportAudio("admin-a", "mission-foreign")).rejects.toThrow(
      "Không tìm thấy báo cáo",
    );
    expect(state.mission.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: "mission-foreign", warehouseId: { in: ["warehouse-a"] } }),
    }));
    expect(state.missionAudio.findUnique).not.toHaveBeenCalled();
  });

  it("projection giữ processing state riêng, severity backend và chỉ ETA có provenance", async () => {
    const createdAt = new Date("2026-07-26T01:00:00.000Z");
    const row = {
      id: "mission-original",
      reportText: "Nước đang dâng",
      status: MissionStatus.DRAFT,
      reportProcessingState: ReportProcessingState.ANALYZED,
      incidentType: IncidentType.FLOOD,
      location: "Thôn A",
      affectedPeople: 100,
      durationHours: 24,
      priority: "CRITICAL",
      incidentLat: null,
      incidentLng: null,
      fulfillment: 50,
      rejectionReason: null,
      adminNote: null,
      deliveryOutcome: null,
      deliveryNote: null,
      createdAt,
      updatedAt: createdAt,
      approvedAt: null,
      completedAt: null,
      parsedInput: {
        incidentType: IncidentType.FLOOD,
        affectedPeople: 100,
        durationHours: 24,
        children: 0,
        elderly: 0,
        medicalSupportCases: 0,
      },
      actionPlan: {
        warehouses: [
          { name: "Kho A", distanceKm: 4, etaMinutes: 12, source: "google", calculatedAt: "2026-07-26T02:00:00.000Z" },
          { name: "Kho cũ", distanceKm: 5, etaMinutes: 15 },
        ],
      },
      readinessAssessment: {
        status: "NEEDS_ACTION",
        fulfillment: 50,
        warehouseOperationalStatus: "READY",
        items: [],
        blockers: [],
        recommendedActions: [],
      },
      audio: null,
      warehouse: { id: "warehouse-a", name: "Kho Thôn A" },
      warehouseRequests: [],
      requirements: [],
    };
    const state = serviceWith({ mission: { findFirst: jest.fn().mockResolvedValue(row) } });

    await expect(state.service.getOwnReport("reporter-a", "mission-original")).resolves.toEqual(
      expect.objectContaining({
        id: "mission-original",
        status: MissionStatus.DRAFT,
        processingState: ReportProcessingState.ANALYZED,
        severityLevel: 5,
        warehouseLogisticsEstimates: [expect.objectContaining({
          label: "WAREHOUSE_LOGISTICS",
          source: "google",
          calculatedAt: "2026-07-26T02:00:00.000Z",
        })],
      }),
    );
  });

  it("does not invent severity before report analysis completes", async () => {
    const createdAt = new Date("2026-07-26T01:00:00.000Z");
    const row = {
      id: "mission-original",
      reportText: "Nước đang dâng",
      status: MissionStatus.DRAFT,
      reportProcessingState: ReportProcessingState.SUBMITTED,
      incidentType: IncidentType.OTHER,
      location: null,
      affectedPeople: 0,
      durationHours: 24,
      priority: "MEDIUM",
      incidentLat: null,
      incidentLng: null,
      fulfillment: 0,
      rejectionReason: null,
      adminNote: null,
      deliveryOutcome: null,
      deliveryNote: null,
      createdAt,
      updatedAt: createdAt,
      approvedAt: null,
      completedAt: null,
      parsedInput: {
        incidentType: IncidentType.OTHER,
        affectedPeople: 0,
        durationHours: 24,
        children: 0,
        elderly: 0,
        medicalSupportCases: 0,
      },
      actionPlan: null,
      readinessAssessment: null,
      audio: null,
      warehouse: { id: "warehouse-a", name: "Kho Thôn A" },
      warehouseRequests: [],
      requirements: [],
    };
    const state = serviceWith({ mission: { findFirst: jest.fn().mockResolvedValue(row) } });

    await expect(state.service.getOwnReport("reporter-a", "mission-original")).resolves.toEqual(
      expect.objectContaining({ severityLevel: null }),
    );
  });

  it("operator projection exposes the persisted plan needed to continue the same Mission", async () => {
    const createdAt = new Date("2026-07-26T01:00:00.000Z");
    const actionPlan = {
      severityLevel: 3,
      severityReason: [],
      confidence: 85,
      fulfillment: 100,
      allocations: [],
      warehouses: [],
      forecasts: [],
      narrative: { objectives: [], phases: [], warnings: [], followUpQuestions: [] },
      generatedBy: "template",
    };
    const readinessAssessment = {
      status: "READY",
      fulfillment: 100,
      warehouseOperationalStatus: "READY",
      items: [],
      blockers: [],
      recommendedActions: [],
    };
    const row = {
      id: "mission-original",
      reportText: "Nước đang dâng",
      status: MissionStatus.DRAFT,
      reportProcessingState: ReportProcessingState.ANALYZED,
      incidentType: IncidentType.FLOOD,
      location: "Thôn A",
      affectedPeople: 20,
      durationHours: 12,
      priority: "HIGH",
      incidentLat: null,
      incidentLng: null,
      fulfillment: 100,
      rejectionReason: null,
      adminNote: null,
      deliveryOutcome: null,
      deliveryNote: null,
      createdAt,
      updatedAt: createdAt,
      approvedAt: null,
      completedAt: null,
      parsedInput: {
        incidentType: IncidentType.FLOOD,
        affectedPeople: 20,
        durationHours: 12,
        children: 0,
        elderly: 0,
        medicalSupportCases: 0,
      },
      actionPlan,
      readinessAssessment,
      audio: null,
      warehouse: { id: "warehouse-a", name: "Kho Thôn A" },
      warehouseRequests: [],
      requirements: [],
    };
    const state = serviceWith({
      user: {
        findUnique: jest.fn().mockResolvedValue({
          ...reporter,
          id: "admin-a",
          role: UserRole.ADMIN,
          warehouseId: null,
        }),
      },
      mission: { findFirst: jest.fn().mockResolvedValue(row) },
    });

    await expect(state.service.getOperatorReport("admin-a", "mission-original")).resolves.toEqual(
      expect.objectContaining({ id: "mission-original", actionPlan, readinessAssessment }),
    );
  });

  it("operator projection keeps batch warehouse ids for reviewed allocation", async () => {
    const createdAt = new Date("2026-07-26T01:00:00.000Z");
    const allocation = {
      batchId: "batch-a",
      qty: 20,
      warehouseId: "warehouse-a",
      warehouseName: "Kho Tân Bình",
    };
    const row = {
      id: "mission-original",
      reportText: "Nước đang dâng",
      status: MissionStatus.DRAFT,
      reportProcessingState: ReportProcessingState.ANALYZED,
      incidentType: IncidentType.FLOOD,
      location: "gần cầu tràn",
      affectedPeople: 20,
      durationHours: 12,
      priority: "HIGH",
      incidentLat: null,
      incidentLng: null,
      fulfillment: 100,
      rejectionReason: null,
      adminNote: null,
      deliveryOutcome: null,
      deliveryNote: null,
      createdAt,
      updatedAt: createdAt,
      approvedAt: null,
      completedAt: null,
      parsedInput: { incidentType: IncidentType.FLOOD, affectedPeople: 20, durationHours: 12, children: 0, elderly: 0, medicalSupportCases: 0 },
      actionPlan: null,
      readinessAssessment: null,
      audio: null,
      warehouse: { id: "warehouse-a", name: "Kho Tân Bình" },
      warehouseRequests: [],
      requirements: [{ sku: "LIFE-ADULT", itemName: "Áo phao", required: 20, allocated: 20, shortage: 0, unit: "chiếc", allocations: [allocation] }],
    };
    const state = serviceWith({
      user: { findUnique: jest.fn().mockResolvedValue({ ...reporter, id: "admin-a", role: UserRole.ADMIN, warehouseId: null }) },
      mission: { findFirst: jest.fn().mockResolvedValue(row) },
    });

    await expect(state.service.getOperatorReport("admin-a", "mission-original")).resolves.toEqual(
      expect.objectContaining({
        sourceHamlet: { warehouseId: "warehouse-a", name: "Kho Tân Bình" },
        requirements: [expect.objectContaining({ allocations: [allocation] })],
      }),
    );
  });

  it("approval materializes only reviewed per-warehouse quantities", async () => {
    const admin = { ...reporter, id: "admin-a", role: UserRole.ADMIN, warehouseId: null };
    const missionWarehouseRequest = {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      createMany: jest.fn().mockResolvedValue({ count: 2 }),
    };
    const mission = {
      findFirst: jest
        .fn()
        .mockResolvedValueOnce({
          id: "mission-original",
          warehouseId: "warehouse-a",
          status: MissionStatus.DRAFT,
          reportProcessingState: ReportProcessingState.ANALYZED,
          location: "gần cầu tràn",
        })
        .mockResolvedValue({
          id: "mission-original",
          reportText: "Nước đang dâng",
          status: MissionStatus.APPROVED,
          reportProcessingState: ReportProcessingState.ANALYZED,
          incidentType: IncidentType.FLOOD,
          location: "gần cầu tràn",
          affectedPeople: 30,
          durationHours: 12,
          priority: "HIGH",
          incidentLat: null,
          incidentLng: null,
          fulfillment: 100,
          rejectionReason: null,
          adminNote: null,
          deliveryOutcome: null,
          deliveryNote: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          approvedAt: new Date(),
          completedAt: null,
          parsedInput: { incidentType: IncidentType.FLOOD, affectedPeople: 30, durationHours: 12, children: 0, elderly: 0, medicalSupportCases: 0 },
          actionPlan: null,
          readinessAssessment: null,
          audio: null,
          warehouse: { id: "warehouse-a", name: "Kho Tân Bình" },
          warehouseRequests: [],
          requirements: [],
        }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findMany: jest.fn(),
      create: jest.fn(),
    };
    const missionRequirement = {
      findMany: jest.fn().mockResolvedValue([
        {
          sku: "LIFE-ADULT",
          itemName: "Áo phao",
          unit: "chiếc",
          allocations: [
            { batchId: "batch-a", qty: 20, warehouseId: "warehouse-a", warehouseName: "Kho Tân Bình" },
            { batchId: "batch-b", qty: 10, warehouseId: "warehouse-b", warehouseName: "Kho Phước Lộc" },
          ],
        },
      ]),
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    };
    const warehouse = {
      findMany: jest
        .fn()
        .mockResolvedValueOnce([{ id: "warehouse-a" }, { id: "warehouse-b" }])
        .mockResolvedValueOnce([
          { id: "warehouse-a", name: "Kho Tân Bình" },
          { id: "warehouse-b", name: "Kho Phước Lộc" },
        ])
        .mockResolvedValue([{ id: "warehouse-a" }, { id: "warehouse-b" }]),
      findFirst: jest.fn(),
      findFirstOrThrow: jest.fn().mockResolvedValue({ id: "warehouse-a", name: "Kho Tân Bình" }),
    };
    const user = { findUnique: jest.fn().mockResolvedValue(admin) };
    const tx = { mission, missionRequirement, missionWarehouseRequest, warehouse, user };
    const prisma = { ...tx, $transaction: jest.fn((callback: (client: typeof tx) => Promise<unknown>) => callback(tx)) };
    const notifications = { create: jest.fn().mockResolvedValue({}) };
    const service = new MissionService(prisma as never, {} as never, {} as never, notifications as never, {} as never, {} as never);

    await service.approveReport("mission-original", "admin-a", {
      requests: [
        { warehouseId: "warehouse-a", sku: "LIFE-ADULT", quantity: 20 },
        { warehouseId: "warehouse-b", sku: "LIFE-ADULT", quantity: 10 },
      ],
    });

    expect(missionWarehouseRequest.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ warehouseId: "warehouse-a", requestedQuantity: 20, allocations: [expect.objectContaining({ batchId: "batch-a", qty: 20 })] }),
        expect.objectContaining({ warehouseId: "warehouse-b", requestedQuantity: 10, allocations: [expect.objectContaining({ batchId: "batch-b", qty: 10 })] }),
      ]),
    });
    expect(mission.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: MissionStatus.APPROVED }),
        data: { status: MissionStatus.PENDING_WAREHOUSE },
      }),
    );
  });
});

describe("MissionService analysis scoping", () => {
  it("does not replace requirements when a stale analyzer loses its claim token", async () => {
    const state = serviceWith({
      user: {
        findUnique: jest.fn().mockResolvedValue({
          ...reporter,
          id: "admin-a",
          role: UserRole.ADMIN,
          warehouseId: null,
        }),
      },
      mission: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    });
    const finalize = state.service as unknown as {
      finalizeAnalysisSuccess(
        id: string,
        token: string,
        analysis: unknown,
        actorUserId: string,
        organizationId: string,
      ): Promise<void>;
    };

    await expect(
      finalize.finalizeAnalysisSuccess(
        "mission-original",
        "stale-claim-token",
        {
          incident: {
            incidentType: IncidentType.FLOOD,
            affectedPeople: 10,
            durationHours: 4,
            children: 0,
            elderly: 0,
            medicalSupportCases: 0,
          },
          fulfillment: 100,
          readinessAssessment: {
            status: "READY",
            fulfillment: 100,
            warehouseOperationalStatus: "READY",
            items: [],
            blockers: [],
            recommendedActions: [],
          },
          requirements: [],
        },
        "admin-a",
        "org-a",
      ),
    ).rejects.toThrow("Quyền phân tích đã hết hạn hoặc báo cáo đã được xử lý");

    expect(state.mission.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ analysisClaimToken: "stale-claim-token" }),
    }));
    expect(state.missionRequirement.deleteMany).not.toHaveBeenCalled();
    expect(state.missionRequirement.createMany).not.toHaveBeenCalled();
  });

  it("scope cluster inventory bằng cả commune và organization", async () => {
    const state = serviceWith({
      user: {
        findUnique: jest.fn().mockResolvedValue({ ...reporter, id: "admin-a", role: UserRole.ADMIN, warehouseId: null }),
      },
      warehouse: {
        findFirst: jest.fn().mockResolvedValue({
          id: "warehouse-a",
          communeId: "commune-shared",
          organizationId: "org-a",
        }),
        findMany: jest.fn().mockResolvedValue([{ id: "warehouse-a", name: "Kho A", lat: null, lng: null, distanceKm: 0 }]),
      },
    });
    Object.assign(state.prisma, {
      itemBatch: { findMany: jest.fn().mockResolvedValue([]) },
      neighborWarehouse: { findMany: jest.fn().mockResolvedValue([]) },
    });
    const service = new MissionService(
      state.prisma as never,
      {} as never,
      {} as never,
      state.notifications as never,
      {} as never,
      { getWarehouseScore: jest.fn().mockResolvedValue(null) } as never,
    );

    await service.generatePlan("warehouse-a", {
      incidentType: IncidentType.OTHER,
      affectedPeople: 1,
      durationHours: 1,
      children: 0,
      elderly: 0,
      medicalSupportCases: 0,
    }, "admin-a");

    expect(state.warehouse.findMany).toHaveBeenCalledWith({
      where: { communeId: "commune-shared", organizationId: "org-a" },
    });
  });
});

describe("MissionService admin warehouse-request review", () => {
  const admin = { ...reporter, id: "admin-a", role: UserRole.ADMIN, warehouseId: null };
  type RequestFixture = {
    id: string;
    missionId: string;
    warehouseId: string;
    sku: string;
    itemName: string;
    unit: string;
    requestedQuantity: number;
    preparedQuantity: number;
    status: MissionWarehouseRequestStatus;
    allocations: { batchId: string; qty: number }[];
    warehouseNote: string | null;
    adminNote: string | null;
    acceptedByUserId: string | null;
    acceptedAt: Date | null;
  };
  const baseRequest: RequestFixture = {
    id: "request-a",
    missionId: "mission-original",
    warehouseId: "warehouse-a",
    sku: "LIFE-ADULT",
    itemName: "Áo phao",
    unit: "chiếc",
    requestedQuantity: 20,
    preparedQuantity: 0,
    status: MissionWarehouseRequestStatus.ACCEPTED,
    allocations: [
      { batchId: "batch-a", qty: 12 },
      { batchId: "batch-b", qty: 8 },
    ],
    warehouseNote: "Kho báo cần điều chỉnh",
    adminNote: null,
    acceptedByUserId: "warehouse-user-a",
    acceptedAt: new Date(),
  };

  function reviewService(request: RequestFixture | null) {
    const state = serviceWith({
      user: { findUnique: jest.fn().mockResolvedValue(admin) },
    });
    const update = jest.fn().mockResolvedValue({
      ...baseRequest,
      requestedQuantity: 15,
      status: MissionWarehouseRequestStatus.PENDING,
      warehouseNote: null,
      adminNote: "Đã kiểm tra",
      warehouse: { name: "Kho Tân Bình" },
      mission: {
        id: "mission-original",
        status: MissionStatus.PENDING_WAREHOUSE,
        incidentType: IncidentType.FLOOD,
        location: null,
        reportText: "Nước đang dâng",
        warehouse: { name: "Kho Tân Bình" },
      },
    });
    const findFirst = jest.fn().mockResolvedValue(request);
    Object.assign(state.tx.missionWarehouseRequest, {
      findFirst,
      update,
    });
    return { ...state, findFirst, update };
  }

  it("blocks cross-organization ADMIN request review", async () => {
    const state = reviewService(null);

    await expect(
      state.service.reviewWarehouseRequest("request-foreign", "admin-a", {
        requestedQuantity: 15,
      }),
    ).rejects.toThrow("Không tìm thấy nhiệm vụ");

    expect(state.findFirst).toHaveBeenCalledWith({
      where: {
        id: "request-foreign",
        warehouse: { organizationId: "org-a" },
        mission: { warehouse: { organizationId: "org-a" } },
      },
    });
    expect(state.update).not.toHaveBeenCalled();
  });

  it("does not edit a prepared request", async () => {
    const state = reviewService({ ...baseRequest, status: MissionWarehouseRequestStatus.PREPARED });

    await expect(
      state.service.reviewWarehouseRequest("request-a", "admin-a", { requestedQuantity: 15 }),
    ).rejects.toThrow("Không thể chỉnh sửa yêu cầu đã chuẩn bị xong");
    expect(state.update).not.toHaveBeenCalled();
  });

  it("resets to PENDING and notifies only the request warehouse", async () => {
    const state = reviewService(baseRequest);

    await state.service.reviewWarehouseRequest("request-a", "admin-a", {
      requestedQuantity: 15,
      adminNote: "Đã kiểm tra",
    });

    expect(state.update).toHaveBeenCalledWith({
      where: { id: "request-a" },
      data: expect.objectContaining({
        requestedQuantity: 15,
        allocations: [
          { batchId: "batch-a", qty: 12 },
          { batchId: "batch-b", qty: 3 },
        ],
        status: MissionWarehouseRequestStatus.PENDING,
        warehouseNote: null,
        acceptedByUserId: null,
        acceptedAt: null,
      }),
      select: expect.any(Object),
    });
    expect(state.notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientRole: UserRole.WAREHOUSE,
        kind: NotificationKind.WAREHOUSE_REQUESTED,
        warehouseId: "warehouse-a",
        organizationId: "org-a",
      }),
    );
  });

  it("does not invent allocations when ADMIN asks to increase quantity", async () => {
    const state = reviewService(baseRequest);

    await expect(
      state.service.reviewWarehouseRequest("request-a", "admin-a", { requestedQuantity: 21 }),
    ).rejects.toThrow("Số lượng vượt quá phần vật tư đã được phân bổ");
    expect(state.update).not.toHaveBeenCalled();
  });
});
