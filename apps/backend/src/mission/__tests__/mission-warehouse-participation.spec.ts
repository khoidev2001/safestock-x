import { MissionStatus } from "@prisma/client";
import { MissionService } from "../mission.service";

const multiWarehouseMission = {
  id: "mission-1",
  warehouseId: "warehouse-a",
  incidentType: "FLOOD",
  affectedPeople: 20,
  status: MissionStatus.DRAFT,
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
      },
      $transaction: jest.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
    };
    const notifications = { pushPersisted: jest.fn() };
    const service = serviceWithPrisma(prisma, notifications);

    await service.approve("mission-1", "admin-1");

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
      where: { id: "mission-1", status: MissionStatus.DRAFT },
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

    await expect(service.getMission("mission-1", "user-b", "warehouse-b")).resolves.toEqual(
      multiWarehouseMission,
    );
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
