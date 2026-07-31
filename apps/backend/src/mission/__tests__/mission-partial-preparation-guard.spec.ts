import { MissionStatus } from "@prisma/client";
import { MissionService } from "../mission.service";

function makeService({
  preparedWarehouseCount = 1,
  preparedRequestCount = 0,
}: {
  preparedWarehouseCount?: number;
  preparedRequestCount?: number;
} = {}) {
  const mission = {
    findUnique: jest.fn().mockResolvedValue({
      id: "mission-1",
      warehouseId: "warehouse-a",
      incidentType: "FLOOD",
      affectedPeople: 20,
      status: MissionStatus.PENDING_WAREHOUSE,
    }),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    findUniqueOrThrow: jest.fn().mockResolvedValue({
      id: "mission-1",
      status: MissionStatus.CANCELLED,
    }),
  };
  const missionWarehousePreparation = {
    count: jest.fn().mockResolvedValue(preparedWarehouseCount),
  };
  const missionWarehouseRequest = {
    count: jest.fn().mockResolvedValue(preparedRequestCount),
  };
  const tx = {
    mission,
    missionWarehousePreparation,
    missionWarehouseRequest,
    $queryRaw: jest.fn().mockResolvedValue([{ id: "mission-1" }]),
  };
  const prisma = {
    mission,
    missionWarehousePreparation,
    $transaction: jest.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
  };
  const notifications = { create: jest.fn().mockResolvedValue({}) };
  const service = new MissionService(
    prisma as never,
    {} as never,
    notifications as never,
    {} as never,
    {} as never,
    {} as never,
  );
  return {
    service,
    prisma,
    mission,
    missionWarehousePreparation,
    missionWarehouseRequest,
    notifications,
  };
}

describe("MissionService khi một phần kho đã xuất", () => {
  it("chặn ADMIN huỷ mission để không làm thất thoát phần đã xuất", async () => {
    const state = makeService();

    await expect(state.service.cancelByAdmin("mission-1", "Dừng nhiệm vụ")).rejects.toThrow(
      "đã có kho xuất vật tư",
    );

    expect(state.mission.updateMany).not.toHaveBeenCalled();
    expect(state.notifications.create).not.toHaveBeenCalled();
  });

  it("legacy RESCUE reject bị state machine chặn vì lực lượng hiện trường chỉ đọc", async () => {
    const state = makeService();

    await expect(state.service.rejectByRescue("mission-1", "Không tiếp cận được")).rejects.toThrow(
      "Không thể chuyển PENDING_WAREHOUSE → REJECTED",
    );

    expect(state.mission.updateMany).not.toHaveBeenCalled();
    expect(state.notifications.create).not.toHaveBeenCalled();
  });

  it("chặn huỷ khi mới một SKU PREPARED nhưng summary kho vẫn chưa hoàn tất", async () => {
    const state = makeService({ preparedWarehouseCount: 0, preparedRequestCount: 1 });

    await expect(state.service.cancelByAdmin("mission-1", "Dừng nhiệm vụ")).rejects.toThrow(
      "đã có kho xuất vật tư",
    );

    expect(state.mission.updateMany).not.toHaveBeenCalled();
  });
});
