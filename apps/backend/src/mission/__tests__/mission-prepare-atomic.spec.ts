import { Logger } from "@nestjs/common";
import { MissionStatus } from "@prisma/client";
import { MissionController } from "../mission.controller";
import { MissionService } from "../mission.service";

const pendingMission = {
  id: "mission-1",
  warehouseId: "warehouse-a",
  incidentType: "FLOOD",
  status: MissionStatus.PENDING_WAREHOUSE,
  requirements: [
    {
      allocations: [{ batchId: "batch-1", qty: 4 }],
    },
  ],
};

const readyMission = {
  id: pendingMission.id,
  incidentType: pendingMission.incidentType,
  status: MissionStatus.READY,
};

type MissionFixture = Omit<typeof pendingMission, "status"> & { status: MissionStatus };

function makeService(options?: {
  initial?: MissionFixture;
  claimCount?: number;
  currentAfterLostClaim?: typeof readyMission;
  recalcError?: Error;
  notificationError?: Error;
}) {
  const mission = {
    findUnique: jest
      .fn()
      .mockResolvedValueOnce(options?.initial ?? pendingMission)
      .mockResolvedValue(options?.currentAfterLostClaim ?? readyMission),
    findUniqueOrThrow: jest.fn().mockResolvedValue(readyMission),
    updateMany: jest.fn().mockResolvedValue({ count: options?.claimCount ?? 1 }),
  };
  const tx = { mission };
  const prisma = {
    $transaction: jest.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
  };
  const inventory = {
    bulkExportInTx: jest.fn().mockResolvedValue({ count: 1, batches: [] }),
    recalcBatches: options?.recalcError
      ? jest.fn().mockRejectedValue(options.recalcError)
      : jest.fn().mockResolvedValue(undefined),
  };
  const notifications = {
    create: options?.notificationError
      ? jest.fn().mockRejectedValue(options.notificationError)
      : jest.fn().mockResolvedValue({}),
  };
  const service = new MissionService(
    prisma as never,
    {} as never,
    {} as never,
    notifications as never,
    inventory as never,
    {} as never,
  );
  return { service, prisma, tx, mission, inventory, notifications };
}

describe("MissionService.prepareByWarehouse", () => {
  it("claim state, scope và xuất kho dùng cùng transaction", async () => {
    const state = makeService();

    await expect(
      state.service.prepareByWarehouse("mission-1", "user-1", "warehouse-a"),
    ).resolves.toEqual(readyMission);

    expect(state.mission.updateMany).toHaveBeenCalledWith({
      where: {
        id: "mission-1",
        status: MissionStatus.PENDING_WAREHOUSE,
        warehouseId: "warehouse-a",
      },
      data: { status: MissionStatus.READY },
    });
    expect(state.inventory.bulkExportInTx).toHaveBeenCalledWith(
      state.tx,
      "user-1",
      [{ batchId: "batch-1", quantity: 4 }],
      "Nhiệm vụ mission-1",
      "warehouse-a",
    );
    expect(state.inventory.recalcBatches).toHaveBeenCalledWith(["batch-1"]);
    expect(state.notifications.create).toHaveBeenCalledTimes(2);
  });

  it("retry trên mission READY trả idempotent, không xuất và không notify lại", async () => {
    const state = makeService({
      initial: { ...pendingMission, status: MissionStatus.READY },
    });

    await expect(state.service.prepareByWarehouse("mission-1", "user-1")).resolves.toEqual(
      readyMission,
    );

    expect(state.mission.updateMany).not.toHaveBeenCalled();
    expect(state.inventory.bulkExportInTx).not.toHaveBeenCalled();
    expect(state.inventory.recalcBatches).not.toHaveBeenCalled();
    expect(state.notifications.create).not.toHaveBeenCalled();
  });

  it("request thua conditional claim đọc lại READY và không xuất lần hai", async () => {
    const state = makeService({ claimCount: 0, currentAfterLostClaim: readyMission });

    await expect(state.service.prepareByWarehouse("mission-1", "user-1")).resolves.toEqual(
      readyMission,
    );

    expect(state.inventory.bulkExportInTx).not.toHaveBeenCalled();
    expect(state.notifications.create).not.toHaveBeenCalled();
  });

  it("mission không có allocation vẫn chuyển READY mà không tạo giao dịch rác", async () => {
    const state = makeService({ initial: { ...pendingMission, requirements: [] } });

    await expect(state.service.prepareByWarehouse("mission-1", "user-1")).resolves.toEqual(
      readyMission,
    );

    expect(state.inventory.bulkExportInTx).not.toHaveBeenCalled();
    expect(state.inventory.recalcBatches).toHaveBeenCalledWith([]);
    expect(state.notifications.create).toHaveBeenCalledTimes(2);
  });

  it("state khác PENDING_WAREHOUSE/READY vẫn bị state machine chặn", async () => {
    const state = makeService({
      initial: { ...pendingMission, status: MissionStatus.CANCELLED },
    });

    await expect(state.service.prepareByWarehouse("mission-1", "user-1")).rejects.toThrow(
      "Không thể chuyển CANCELLED → READY",
    );

    expect(state.mission.updateMany).not.toHaveBeenCalled();
    expect(state.inventory.bulkExportInTx).not.toHaveBeenCalled();
  });

  it("mission thuộc kho khác bị chặn trước cả nhánh READY idempotent", async () => {
    const state = makeService({
      initial: { ...pendingMission, warehouseId: "warehouse-b", status: MissionStatus.READY },
    });

    await expect(
      state.service.prepareByWarehouse("mission-1", "user-1", "warehouse-a"),
    ).rejects.toThrow("Bạn chỉ được thao tác trên kho thôn được phân công");

    expect(state.mission.updateMany).not.toHaveBeenCalled();
    expect(state.inventory.bulkExportInTx).not.toHaveBeenCalled();
  });

  it("lỗi hậu commit không biến prepare đã thành công thành response lỗi", async () => {
    jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    const state = makeService({
      recalcError: new Error("readiness unavailable"),
      notificationError: new Error("notification unavailable"),
    });

    await expect(state.service.prepareByWarehouse("mission-1", "user-1")).resolves.toEqual(
      readyMission,
    );
  });
});

describe("MissionController.prepare", () => {
  it("truyền warehouseId từ JWT xuống service để chặn IDOR", async () => {
    const missions = { prepareByWarehouse: jest.fn().mockResolvedValue(readyMission) };
    const controller = new MissionController(missions as never, {} as never);

    await controller.prepare(
      { user: { userId: "user-1", warehouseId: "warehouse-a" } } as never,
      "mission-1",
    );

    expect(missions.prepareByWarehouse).toHaveBeenCalledWith(
      "mission-1",
      "user-1",
      "warehouse-a",
    );
  });
});
