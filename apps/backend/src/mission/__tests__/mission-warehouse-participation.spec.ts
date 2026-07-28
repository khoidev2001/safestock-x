import { MissionStatus } from "@prisma/client";
import { MissionService } from "../mission.service";

const multiWarehouseMission = {
  id: "mission-1",
  warehouseId: "warehouse-a",
  incidentType: "FLOOD",
  affectedPeople: 20,
  status: MissionStatus.PENDING_RESCUE,
  requirements: [
    {
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
  it("RESCUE confirm tạo đúng một preparation cho mỗi kho có allocation", async () => {
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
    const tx = { mission, missionWarehousePreparation };
    const prisma = {
      mission,
      $transaction: jest.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
    };
    const notifications = { create: jest.fn().mockResolvedValue({}) };
    const service = serviceWithPrisma(prisma, notifications);

    await service.confirmByRescue("mission-1");

    expect(missionWarehousePreparation.createMany).toHaveBeenCalledWith({
      data: [
        { missionId: "mission-1", warehouseId: "warehouse-a" },
        { missionId: "mission-1", warehouseId: "warehouse-b" },
      ],
      skipDuplicates: true,
    });
    expect(mission.updateMany).toHaveBeenCalledWith({
      where: { id: "mission-1", status: MissionStatus.PENDING_RESCUE },
      data: { status: MissionStatus.PENDING_WAREHOUSE },
    });
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

    await expect(
      service.getMission("mission-1", "user-b", "warehouse-b"),
    ).resolves.toEqual(multiWarehouseMission);
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
        include: { requirements: true, warehousePreparations: true },
      }),
    );
  });
});
