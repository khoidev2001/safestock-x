import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { MissionStatus, PickupDecision, Prisma, RequirementSource } from "@prisma/client";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { IncidentType } from "@safestock/shared-types";
import { GeneratePlanDto, PlanFromReportDto, SubmitReportDto } from "../dto";
import { MissionService } from "../mission.service";

const incident = {
  incidentType: IncidentType.FLOOD,
  affectedPeople: 5,
  durationHours: 12,
  children: 1,
  elderly: 1,
  medicalSupportCases: 0,
};

function makeService() {
  const mission = {
    findUnique: jest.fn(),
    findUniqueOrThrow: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  };
  const missionRequirement = {
    deleteMany: jest.fn(),
    upsert: jest.fn(),
  };
  const tx = { mission, missionRequirement };
  const prisma = {
    mission,
    $transaction: jest.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
  };
  const notifications = { create: jest.fn() };
  const service = new MissionService(
    prisma as never,
    {} as never,
    notifications as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  return { service, prisma, mission, missionRequirement, notifications };
}

describe("Mission report DTO validation", () => {
  it.each([
    [{ ...incident, incidentType: "UNKNOWN" }],
    [{ ...incident, affectedPeople: -1 }],
    [{ ...incident, durationHours: 1.5 }],
  ])("chặn incident nested sai contract: %j", async (invalidIncident) => {
    const dto = plainToInstance(PlanFromReportDto, { incident: invalidIncident });

    await expect(validate(dto)).resolves.not.toHaveLength(0);
  });

  it.each([
    { incidentLat: 91, incidentLng: 108 },
    { incidentLat: 13, incidentLng: -181 },
    { incidentLat: 13 },
    { incidentLng: 108 },
  ])("chặn tọa độ ngoài range hoặc thiếu nửa cặp: %j", async (coordinates) => {
    const dto = plainToInstance(GeneratePlanDto, {
      warehouseId: "warehouse-1",
      incident,
      ...coordinates,
    });

    await expect(validate(dto)).resolves.not.toHaveLength(0);
  });

  it("chấp nhận bỏ trống cả cặp tọa độ và requestId hợp lệ", async () => {
    const dto = plainToInstance(SubmitReportDto, {
      description: "Nước lũ đang dâng nhanh tại điểm tránh trú.",
      requestId: "report-attempt-1",
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });
});

describe("MissionService report planning invariants", () => {
  const draft = {
    id: "mission-1",
    warehouseId: "warehouse-1",
    status: MissionStatus.DRAFT,
    incidentLat: 13.37,
    incidentLng: 108.61,
  };
  const quantities = [{ sku: "RICE-01", itemName: "Gạo", unit: "kg", required: 5 }];

  it("không sửa requirement khi conditional DRAFT claim thua dispatch", async () => {
    const state = makeService();
    state.mission.findUnique
      .mockResolvedValueOnce(draft)
      .mockResolvedValueOnce({ ...draft, status: MissionStatus.PENDING_RESCUE });
    state.mission.updateMany.mockResolvedValue({ count: 0 });
    jest
      .spyOn(state.service as never, "computeRequirementQuantities" as never)
      .mockResolvedValue(quantities as never);

    await expect(state.service.planFromReport(draft.id, incident)).rejects.toBeInstanceOf(
      BadRequestException,
    );

    expect(state.missionRequirement.deleteMany).not.toHaveBeenCalled();
    expect(state.missionRequirement.upsert).not.toHaveBeenCalled();
  });

  it("claim trước khi thay requirement và xóa dữ liệu dẫn xuất cũ khi re-plan", async () => {
    const state = makeService();
    const planned = { ...draft, requirements: [{ id: "requirement-1" }] };
    state.mission.findUnique.mockResolvedValueOnce(draft);
    state.mission.updateMany.mockResolvedValue({ count: 1 });
    state.mission.findUniqueOrThrow.mockResolvedValue(planned);
    state.missionRequirement.deleteMany.mockResolvedValue({ count: 1 });
    state.missionRequirement.upsert.mockResolvedValue({});
    jest
      .spyOn(state.service as never, "computeRequirementQuantities" as never)
      .mockResolvedValue(quantities as never);

    await expect(state.service.planFromReport(draft.id, incident)).resolves.toEqual(planned);

    expect(state.mission.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: draft.id, status: MissionStatus.DRAFT },
        data: expect.objectContaining({
          actionPlan: Prisma.DbNull,
          explanation: null,
          incidentLat: draft.incidentLat,
          incidentLng: draft.incidentLng,
          // Tính lại nhu cầu là bỏ phần chọn kho cũ: số lượng đổi thì kho nào
          // xuất bao nhiêu cũng phải tính lại từ đầu.
          allocationPlannedAt: null,
        }),
      }),
    );
    expect(state.mission.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      state.missionRequirement.upsert.mock.invocationCallOrder[0],
    );
  });

  it("lượt tính lại định mức KHÔNG xoá món ADMIN tự thêm", async () => {
    // Đây là chốt chặn hồi quy. Bản cũ chạy `deleteMany` cho cả nhiệm vụ rồi dựng
    // lại từ định mức, nên mỗi lượt "Lưu và tính lại" xoá trắng phần ADMIN vừa
    // soạn — và trên đường phát hành, xoá luôn quyết định của hiện trường.
    const state = makeService();
    state.mission.findUnique.mockResolvedValueOnce(draft);
    state.mission.updateMany.mockResolvedValue({ count: 1 });
    state.mission.findUniqueOrThrow.mockResolvedValue(draft);
    state.missionRequirement.deleteMany.mockResolvedValue({ count: 0 });
    state.missionRequirement.upsert.mockResolvedValue({});
    jest
      .spyOn(state.service as never, "computeRequirementQuantities" as never)
      .mockResolvedValue(quantities as never);

    await state.service.planFromReport(draft.id, incident);

    // Chỉ được dọn dòng do ĐỊNH MỨC sinh ra mà định mức mới không còn nhắc tới.
    expect(state.missionRequirement.deleteMany).toHaveBeenCalledWith({
      where: {
        missionId: draft.id,
        source: RequirementSource.NORM,
        sku: { notIn: ["RICE-01"] },
      },
    });
  });

  it("chặn phát hành report thô chưa có readiness và requirement", async () => {
    const state = makeService();
    state.mission.findUnique.mockResolvedValue({
      ...draft,
      status: MissionStatus.FIELD_DECIDED,
      // Đã lập kế hoạch rồi mà vẫn không có món nào: không còn gì để điều phối.
      allocationPlannedAt: new Date("2026-09-08T00:00:00Z"),
      readinessAssessment: null,
      _count: { requirements: 0 },
      requirements: [],
      warehouse: { organizationId: "org-1" },
    });

    await expect(state.service.publishPlan(draft.id, undefined as never)).rejects.toThrow(
      "Chưa thể điều phối báo cáo chưa được lập phương án",
    );

    expect(state.mission.updateMany).not.toHaveBeenCalled();
    expect(state.notifications.create).not.toHaveBeenCalled();
  });

  it("chặn lập kế hoạch hành động cho nhiệm vụ chưa có điểm ứng phó", async () => {
    const state = makeService();
    state.mission.findUnique.mockResolvedValue({
      ...draft,
      incidentLat: null,
      incidentLng: null,
      parsedInput: incident,
      fulfillment: 100,
      requirements: [],
    });

    await expect(state.service.generateActionPlan(draft.id)).rejects.toThrow(
      "Cần xác nhận địa điểm ứng phó",
    );
    expect(state.mission.update).not.toHaveBeenCalled();
  });
});

describe("MissionService organization scope", () => {
  const ownedIncident = { ...incident };
  const foreignMission = {
    id: "mission-foreign",
    warehouseId: "warehouse-foreign",
    status: MissionStatus.DRAFT,
    reportText: "Bao cao cua to chuc khac",
    readinessAssessment: { status: "DISPATCHABLE", blockers: [] },
    _count: { requirements: 1 },
    requirements: [],
  };

  function makeScopedService() {
    const mission = {
      findUnique: jest.fn().mockResolvedValue(foreignMission),
      findMany: jest.fn().mockImplementation(({ where }: { where: Record<string, unknown> }) => {
        const warehouse = where.warehouse as { organizationId?: string } | undefined;
        return warehouse?.organizationId === "org-actor" ? [] : [foreignMission];
      }),
      create: jest.fn().mockResolvedValue({ id: "mission-created" }),
      updateMany: jest.fn(),
    };
    const prisma = {
      mission,
      user: {
        findUnique: jest.fn().mockResolvedValue({ organizationId: "org-actor" }),
      },
      warehouse: {
        findUnique: jest.fn().mockResolvedValue({
          id: "warehouse-foreign",
          organizationId: "org-foreign",
        }),
      },
      $transaction: jest.fn(),
    };
    const notifications = { pushPersisted: jest.fn() };
    const service = new MissionService(
      prisma as never,
      {} as never,
      notifications as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    return { service, prisma, mission, notifications };
  }

  it("hides a mission from an actor in another organization", async () => {
    const state = makeScopedService();

    await expect(state.service.getMission(foreignMission.id, "actor-1")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("omits missions from other organizations in list results", async () => {
    const state = makeScopedService();

    await expect(state.service.listMissions(undefined, "actor-1")).resolves.toEqual([]);
  });

  it("blocks planning an existing report from another organization before mutation", async () => {
    const state = makeScopedService();

    await expect(
      state.service.planFromReport(foreignMission.id, ownedIncident, undefined, "actor-1"),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(state.prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each([
    [
      "approve",
      () => stateForTransition().service.publishPlan(foreignMission.id, "actor-1", "warehouse-owned"),
    ],
    [
      "cancel",
      () =>
        stateForTransition().service.cancelByAdmin(foreignMission.id, undefined, "warehouse-owned"),
    ],
    [
      "complete",
      () =>
        stateForTransition().service.completeByRescue(
          foreignMission.id,
          "DELIVERED",
          "actor-1",
          undefined,
          "warehouse-owned",
        ),
    ],
  ])("blocks %s for a mission outside warehouse scope", async (_name, transition) => {
    await expect(transition()).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("blocks generating a plan against a warehouse from another organization", async () => {
    const state = makeScopedService();
    jest
      .spyOn(state.service as never, "computeRequirementQuantities" as never)
      .mockResolvedValue([] as never);

    await expect(
      state.service.generatePlan("warehouse-foreign", ownedIncident, "actor-1"),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(state.mission.create).not.toHaveBeenCalled();
  });

  function stateForTransition() {
    return makeScopedService();
  }
});

describe("MissionService reporter history", () => {
  it("lists only the reporter's own text reports with a bounded cursor page", async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        id: "mission-2",
        createdAt: new Date("2026-07-29T02:00:00.000Z"),
        reportText: "Nước dâng tại nhà văn hóa.",
        status: MissionStatus.DRAFT,
        warehouse: { name: "Kho tổng xã" },
      },
    ]);
    const userFindUnique = jest.fn().mockResolvedValue({ organizationId: "org-1" });
    const prisma = {
      mission: { findMany },
      user: { findUnique: userFindUnique },
    };
    const service = new MissionService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(service.listOwnReports("reporter-1", undefined, "cursor-1", 999)).resolves.toEqual(
      {
        items: [
          {
            id: "mission-2",
            createdAt: new Date("2026-07-29T02:00:00.000Z"),
            reportText: "Nước dâng tại nhà văn hóa.",
            status: MissionStatus.DRAFT,
            warehouse: { name: "Kho tổng xã" },
          },
        ],
        nextCursor: null,
      },
    );
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          createdByUserId: "reporter-1",
          warehouse: { organizationId: "org-1" },
        }),
        cursor: { id: "cursor-1" },
        skip: 1,
        take: 51,
      }),
    );
  });

  it("does not return another reporter's report detail", async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const prisma = {
      mission: { findFirst },
      user: { findUnique: jest.fn().mockResolvedValue({ organizationId: "org-1" }) },
    };
    const service = new MissionService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(service.getOwnReport("mission-foreign", "reporter-1")).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "mission-foreign",
          createdByUserId: "reporter-1",
          warehouse: { organizationId: "org-1" },
        }),
      }),
    );
  });
});

describe("MissionService publish atomicity", () => {
  it("keeps the mission in DRAFT when notification persistence fails", async () => {
    const missionState = {
      id: "mission-1",
      warehouseId: "warehouse-1",
      status: MissionStatus.FIELD_DECIDED,
      allocationPlannedAt: new Date("2026-09-08T00:00:00Z"),
      incidentType: IncidentType.FLOOD,
      affectedPeople: 5,
      incidentLat: 13.37,
      incidentLng: 108.61,
      readinessAssessment: { status: "DISPATCHABLE", blockers: [] },
      _count: { requirements: 1 },
      warehouse: { organizationId: "organization-1" },
      requirements: [{ allocations: [], pickupDecision: PickupDecision.TAKE_ALL }],
    };
    const persistedNotifications: object[] = [];
    const mission = {
      findUnique: jest.fn().mockImplementation(() => ({ ...missionState })),
      updateMany: jest.fn().mockImplementation(({ where, data }) => {
        if (missionState.id !== where.id || missionState.status !== where.status)
          return { count: 0 };
        Object.assign(missionState, data);
        return { count: 1 };
      }),
      findUniqueOrThrow: jest.fn().mockImplementation(() => ({ ...missionState })),
    };
    const tx = {
      mission,
      missionWarehousePreparation: {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      notification: {
        create: jest.fn().mockRejectedValue(new Error("notification insert failed")),
      },
    };
    const prisma = {
      mission,
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => {
        const statusBefore = missionState.status;
        const notificationsBefore = persistedNotifications.length;
        try {
          return await callback(tx);
        } catch (error) {
          missionState.status = statusBefore;
          persistedNotifications.splice(notificationsBefore);
          throw error;
        }
      }),
    };
    const notifications = { pushPersisted: jest.fn() };
    const service = new MissionService(
      prisma as never,
      {} as never,
      notifications as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(service.publishPlan(missionState.id, undefined as never)).rejects.toThrow(
      "notification insert failed",
    );

    expect(missionState.status).toBe(MissionStatus.FIELD_DECIDED);
    expect(persistedNotifications).toEqual([]);
    expect(notifications.pushPersisted).not.toHaveBeenCalled();
  });
});
