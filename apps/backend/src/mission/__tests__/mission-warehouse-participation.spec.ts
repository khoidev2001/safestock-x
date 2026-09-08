import { MissionStatus, PickupDecision } from "@prisma/client";
import { MissionService } from "../mission.service";

const multiWarehouseMission = {
  id: "mission-1",
  missionNo: 12,
  warehouseId: "warehouse-a",
  incidentType: "FLOOD",
  affectedPeople: 20,
  hamletName: null,
  location: null,
  // Hiện trường đã chốt và ADMIN đã lập kế hoạch: đó là điều kiện để phát hành.
  status: MissionStatus.FIELD_DECIDED,
  allocationPlannedAt: new Date("2026-09-08T00:00:00Z"),
  incidentLat: 13.378,
  incidentLng: 109.104,
  readinessAssessment: { status: "DISPATCHABLE", blockers: [] },
  _count: { requirements: 1 },
  warehouse: { organizationId: "org-1" },
  requirements: [
    {
      sku: "WATER-01",
      itemName: "Nước uống",
      unit: "chai",
      pickupDecision: PickupDecision.TAKE_ALL,
      warehouseQuantity: 10,
      allocations: [
        { batchId: "batch-a", qty: 4, warehouseId: "warehouse-a" },
        { batchId: "batch-b", qty: 6, warehouseId: "warehouse-b" },
      ],
    },
  ],
  warehousePreparations: [
    {
      id: "preparation-b",
      missionId: "mission-1",
      warehouseId: "warehouse-b",
      preparedByUserId: null,
      preparedAt: null,
    },
  ],
};

function serviceWithPrisma(prisma: Record<string, unknown>, notifications = {}) {
  return new MissionService(
    prisma as never,
    {} as never,
    notifications as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
}

describe("MissionService warehouse participation", () => {
  it("ADMIN phát hành tạo đúng một preparation cho mỗi kho có allocation", async () => {
    const mission = {
      findUnique: jest.fn().mockResolvedValue(multiWarehouseMission),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        ...multiWarehouseMission,
        status: MissionStatus.PENDING_WAREHOUSE,
      }),
    };
    const missionWarehousePreparation = {
      createMany: jest.fn().mockResolvedValue({ count: 2 }),
    };
    const missionWarehouseRequest = {
      createMany: jest.fn().mockResolvedValue({ count: 2 }),
    };
    const notification = {
      create: jest
        .fn()
        .mockResolvedValueOnce({ id: "notification-warehouse" })
        .mockResolvedValueOnce({ id: "notification-field-force" }),
    };
    const tx = {
      mission,
      missionWarehousePreparation,
      missionWarehouseRequest,
      notification,
    };
    const prisma = {
      mission,
      user: {
        findUnique: jest.fn().mockResolvedValue({ organizationId: "org-1" }),
      },
      warehouse: {
        findUnique: jest.fn().mockResolvedValue({ organizationId: "org-1" }),
        findMany: jest.fn().mockResolvedValue([
          { id: "warehouse-a", name: "Kho A" },
          { id: "warehouse-b", name: "Kho B" },
        ]),
      },
      // Đủ tồn và chưa ai đặt gạch → lượt đối chiếu trước khi phát hành không
      // chặn, nên phần kiểm tra bên dưới vẫn nói đúng về việc tạo preparation.
      itemBatch: {
        findMany: jest.fn().mockResolvedValue([
          {
            quantity: 100,
            item: { sku: "WATER-01" },
            shelf: { zone: { warehouseId: "warehouse-a" } },
            loans: [],
          },
          {
            quantity: 100,
            item: { sku: "WATER-01" },
            shelf: { zone: { warehouseId: "warehouse-b" } },
            loans: [],
          },
        ]),
      },
      missionWarehouseRequest: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
    };
    const notifications = { pushPersisted: jest.fn() };
    const service = serviceWithPrisma(prisma, notifications);

    await service.publishPlan("mission-1", "admin-1");

    expect(missionWarehousePreparation.createMany).toHaveBeenCalledWith({
      data: [
        { missionId: "mission-1", warehouseId: "warehouse-a" },
        { missionId: "mission-1", warehouseId: "warehouse-b" },
      ],
      skipDuplicates: true,
    });
    expect(missionWarehouseRequest.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          missionId: "mission-1",
          warehouseId: "warehouse-a",
          sku: "WATER-01",
          requestedQuantity: 4,
        }),
        expect.objectContaining({
          missionId: "mission-1",
          warehouseId: "warehouse-b",
          sku: "WATER-01",
          requestedQuantity: 6,
        }),
      ],
      skipDuplicates: true,
    });
    expect(mission.updateMany).toHaveBeenCalledWith({
      where: { id: "mission-1", status: MissionStatus.FIELD_DECIDED },
      data: expect.objectContaining({
        status: MissionStatus.PENDING_WAREHOUSE,
        approvedByUserId: "admin-1",
      }),
    });
    expect(notification.create).toHaveBeenCalledTimes(2);
    expect(notifications.pushPersisted).toHaveBeenCalledTimes(2);
  });

  it("kho tham gia đọc được mission dù không phải kho nguồn", async () => {
    const prisma = {
      mission: {
        findUnique: jest.fn().mockResolvedValue(multiWarehouseMission),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({ organizationId: "org-1" }),
      },
      warehouse: {
        findUnique: jest.fn().mockResolvedValue({ organizationId: "org-1" }),
      },
    };
    const service = serviceWithPrisma(prisma);

    // `getMission` đổi `_count` thành cờ `hasCoordinationAnalysis` trước khi trả
    // ra: client cần biết CÓ bản tham mưu hay chưa, không cần con số đếm.
    const { _count, ...expected } = multiWarehouseMission;
    await expect(service.getMission("mission-1", "user-b", "warehouse-b")).resolves.toEqual({
      ...expected,
      hasCoordinationAnalysis: false,
    });
  });

  it("danh sách của kho gồm cả mission mà kho đó tham gia", async () => {
    const findMany = jest.fn().mockResolvedValue([multiWarehouseMission]);
    const prisma = {
      mission: { findMany },
      user: {
        findUnique: jest.fn().mockResolvedValue({ organizationId: "org-1" }),
      },
    };
    const service = serviceWithPrisma(prisma);

    await service.listMissions(undefined, "user-b", "warehouse-b");

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            { warehouseId: "warehouse-b" },
            {
              warehousePreparations: {
                some: { warehouseId: "warehouse-b" },
              },
            },
          ],
          warehouse: { organizationId: "org-1" },
        }),
        include: expect.objectContaining({
          requirements: true,
          warehousePreparations: true,
          warehouseRequests: expect.any(Object),
        }),
      }),
    );
  });
});
