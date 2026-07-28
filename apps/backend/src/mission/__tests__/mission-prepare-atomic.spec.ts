import { Logger } from "@nestjs/common";
import { MissionStatus } from "@prisma/client";
import { MissionController } from "../mission.controller";
import { MissionService } from "../mission.service";

interface AllocationFixture {
  batchId: string;
  qty: number;
  warehouseId?: string;
}

interface PreparationFixture {
  missionId: string;
  warehouseId: string;
  preparedByUserId: string | null;
  preparedAt: Date | null;
}

interface MissionFixture {
  id: string;
  warehouseId: string;
  incidentType: string;
  status: MissionStatus;
  requirements: { allocations: AllocationFixture[] }[];
  warehousePreparations: PreparationFixture[];
}

const pendingPreparation: PreparationFixture = {
  missionId: "mission-1",
  warehouseId: "warehouse-a",
  preparedByUserId: null,
  preparedAt: null,
};

const pendingMission: MissionFixture = {
  id: "mission-1",
  warehouseId: "warehouse-a",
  incidentType: "FLOOD",
  status: MissionStatus.PENDING_WAREHOUSE,
  requirements: [
    {
      allocations: [{ batchId: "batch-1", qty: 4, warehouseId: "warehouse-a" }],
    },
  ],
  warehousePreparations: [pendingPreparation],
};

const readyMission: MissionFixture = {
  ...pendingMission,
  status: MissionStatus.READY,
  warehousePreparations: [
    {
      ...pendingPreparation,
      preparedByUserId: "user-1",
      preparedAt: new Date("2026-07-27T00:00:00.000Z"),
    },
  ],
};

function makeService(options?: {
  initial?: MissionFixture;
  preparationClaimCount?: number;
  currentPreparation?: PreparationFixture | null;
  remainingCount?: number;
  readyClaimCount?: number;
  resultMission?: MissionFixture;
  userWarehouseId?: string | null;
  recalcError?: Error;
  notificationError?: Error;
}) {
  const initial = options?.initial ?? pendingMission;
  const resultMission =
    options?.resultMission ??
    (options?.remainingCount && options.remainingCount > 0 ? initial : readyMission);
  const mission = {
    findUnique: jest.fn().mockResolvedValue(initial),
    findUniqueOrThrow: jest.fn().mockResolvedValue(resultMission),
    updateMany: jest.fn().mockResolvedValue({ count: options?.readyClaimCount ?? 1 }),
  };
  const missionWarehousePreparation = {
    createMany: jest.fn().mockResolvedValue({ count: 0 }),
    updateMany: jest.fn().mockResolvedValue({
      count: options?.preparationClaimCount ?? 1,
    }),
    findUnique: jest.fn().mockResolvedValue(
      options?.currentPreparation === undefined
        ? initial.warehousePreparations[0] ?? null
        : options.currentPreparation,
    ),
    count: jest.fn().mockResolvedValue(options?.remainingCount ?? 0),
  };
  const tx = {
    mission,
    missionWarehousePreparation,
    $queryRaw: jest.fn().mockResolvedValue([{ id: initial.id }]),
  };
  const prisma = {
    $transaction: jest.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
    user: {
      findUnique: jest.fn().mockResolvedValue({
        warehouseId:
          options?.userWarehouseId === undefined
            ? "warehouse-a"
            : options.userWarehouseId,
      }),
    },
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
    notifications as never,
    inventory as never,
    {} as never,
    {} as never,
  );
  return {
    service,
    prisma,
    tx,
    mission,
    missionWarehousePreparation,
    inventory,
    notifications,
  };
}

describe("MissionService.prepareByWarehouse", () => {
  it("chỉ xuất allocation của kho đang thao tác và chưa READY khi còn kho khác", async () => {
    const multiWarehouseMission: MissionFixture = {
      ...pendingMission,
      requirements: [
        {
          allocations: [
            { batchId: "batch-a", qty: 4, warehouseId: "warehouse-a" },
            { batchId: "batch-b", qty: 6, warehouseId: "warehouse-b" },
          ],
        },
      ],
      warehousePreparations: [
        pendingPreparation,
        { ...pendingPreparation, warehouseId: "warehouse-b" },
      ],
    };
    const partiallyPreparedMission: MissionFixture = {
      ...multiWarehouseMission,
      warehousePreparations: [
        {
          ...pendingPreparation,
          preparedByUserId: "user-1",
          preparedAt: new Date("2026-07-27T00:00:00.000Z"),
        },
        { ...pendingPreparation, warehouseId: "warehouse-b" },
      ],
    };
    const state = makeService({
      initial: multiWarehouseMission,
      remainingCount: 1,
      resultMission: partiallyPreparedMission,
    });

    await expect(
      state.service.prepareByWarehouse("mission-1", "user-1", "warehouse-a"),
    ).resolves.toEqual(partiallyPreparedMission);

    expect(state.inventory.bulkExportInTx).toHaveBeenCalledWith(
      state.tx,
      "user-1",
      [{ batchId: "batch-a", quantity: 4 }],
      "Nhiệm vụ mission-1",
      "warehouse-a",
    );
    expect(state.mission.updateMany).not.toHaveBeenCalled();
    expect(state.notifications.create).not.toHaveBeenCalled();
  });

  it("cho phép kho tham gia chuẩn bị dù không phải warehouseId nguồn của mission", async () => {
    const warehouseBPreparation = {
      ...pendingPreparation,
      warehouseId: "warehouse-b",
    };
    const state = makeService({
      initial: {
        ...pendingMission,
        requirements: [
          {
            allocations: [
              { batchId: "batch-a", qty: 4, warehouseId: "warehouse-a" },
              { batchId: "batch-b", qty: 6, warehouseId: "warehouse-b" },
            ],
          },
        ],
        warehousePreparations: [pendingPreparation, warehouseBPreparation],
      },
      currentPreparation: warehouseBPreparation,
      userWarehouseId: "warehouse-b",
    });

    await expect(
      state.service.prepareByWarehouse("mission-1", "user-2", "warehouse-b"),
    ).resolves.toEqual(readyMission);

    expect(state.inventory.bulkExportInTx).toHaveBeenCalledWith(
      state.tx,
      "user-2",
      [{ batchId: "batch-b", quantity: 6 }],
      "Nhiệm vụ mission-1",
      "warehouse-b",
    );
  });

  it("kho cuối cùng claim trong cùng transaction rồi mới chuyển mission READY", async () => {
    const state = makeService();

    await expect(
      state.service.prepareByWarehouse("mission-1", "user-1", "warehouse-a"),
    ).resolves.toEqual(readyMission);

    expect(state.missionWarehousePreparation.updateMany).toHaveBeenCalledWith({
      where: {
        missionId: "mission-1",
        warehouseId: "warehouse-a",
        preparedAt: null,
      },
      data: {
        preparedByUserId: "user-1",
        preparedAt: expect.any(Date),
      },
    });
    expect(state.tx.$queryRaw).toHaveBeenCalled();
    expect(state.mission.updateMany).toHaveBeenCalledWith({
      where: {
        id: "mission-1",
        status: MissionStatus.PENDING_WAREHOUSE,
      },
      data: { status: MissionStatus.READY },
    });
    expect(state.inventory.recalcBatches).toHaveBeenCalledWith(["batch-1"]);
    expect(state.notifications.create).toHaveBeenCalledTimes(2);
  });

  it("retry của chính kho đã prepare trả idempotent, không xuất và không notify lại", async () => {
    const prepared = readyMission.warehousePreparations[0];
    const state = makeService({
      initial: readyMission,
      preparationClaimCount: 0,
      currentPreparation: prepared,
      resultMission: readyMission,
    });

    await expect(
      state.service.prepareByWarehouse("mission-1", "user-1", "warehouse-a"),
    ).resolves.toEqual(readyMission);

    expect(state.inventory.bulkExportInTx).not.toHaveBeenCalled();
    expect(state.inventory.recalcBatches).not.toHaveBeenCalled();
    expect(state.notifications.create).not.toHaveBeenCalled();
  });

  it("request thua claim của cùng kho đọc preparedAt và không xuất lần hai", async () => {
    const prepared = readyMission.warehousePreparations[0];
    const state = makeService({
      preparationClaimCount: 0,
      currentPreparation: prepared,
      resultMission: readyMission,
    });

    await expect(
      state.service.prepareByWarehouse("mission-1", "user-1", "warehouse-a"),
    ).resolves.toEqual(readyMission);

    expect(state.inventory.bulkExportInTx).not.toHaveBeenCalled();
    expect(state.notifications.create).not.toHaveBeenCalled();
  });

  it("retry mission READY cũ chưa có preparation được backfill an toàn, không xuất lại", async () => {
    const prepared = readyMission.warehousePreparations[0];
    const state = makeService({
      initial: {
        ...readyMission,
        warehousePreparations: [],
      },
      currentPreparation: prepared,
      resultMission: readyMission,
    });

    await expect(
      state.service.prepareByWarehouse("mission-1", "user-1", "warehouse-a"),
    ).resolves.toEqual(readyMission);

    expect(state.missionWarehousePreparation.createMany).toHaveBeenCalledWith({
      data: [
        {
          missionId: "mission-1",
          warehouseId: "warehouse-a",
          preparedAt: expect.any(Date),
        },
      ],
      skipDuplicates: true,
    });
    expect(state.inventory.bulkExportInTx).not.toHaveBeenCalled();
  });

  it("mission không có allocation vẫn cho kho nguồn hoàn tất mà không tạo giao dịch rác", async () => {
    const state = makeService({
      initial: { ...pendingMission, requirements: [] },
    });

    await expect(
      state.service.prepareByWarehouse("mission-1", "user-1", "warehouse-a"),
    ).resolves.toEqual(readyMission);

    expect(state.inventory.bulkExportInTx).not.toHaveBeenCalled();
    expect(state.inventory.recalcBatches).toHaveBeenCalledWith([]);
    expect(state.notifications.create).toHaveBeenCalledTimes(2);
  });

  it("state khác PENDING_WAREHOUSE/READY vẫn bị state machine chặn", async () => {
    const state = makeService({
      initial: { ...pendingMission, status: MissionStatus.CANCELLED },
    });

    await expect(
      state.service.prepareByWarehouse("mission-1", "user-1", "warehouse-a"),
    ).rejects.toThrow("Không thể chuyển CANCELLED → READY");

    expect(state.missionWarehousePreparation.updateMany).not.toHaveBeenCalled();
    expect(state.inventory.bulkExportInTx).not.toHaveBeenCalled();
  });

  it("kho không tham gia mission bị chặn trước khi claim hoặc xuất", async () => {
    const state = makeService({ userWarehouseId: "warehouse-b" });

    await expect(
      state.service.prepareByWarehouse("mission-1", "user-2", "warehouse-b"),
    ).rejects.toThrow("Kho của bạn không được phân bổ vật tư trong nhiệm vụ này");

    expect(state.missionWarehousePreparation.updateMany).not.toHaveBeenCalled();
    expect(state.inventory.bulkExportInTx).not.toHaveBeenCalled();
  });

  it("tài khoản WAREHOUSE chưa gán kho bị chặn thay vì xuất toàn bộ mission", async () => {
    const state = makeService({ userWarehouseId: null });

    await expect(
      state.service.prepareByWarehouse("mission-1", "user-1"),
    ).rejects.toThrow("Tài khoản kho chưa được gán kho phụ trách");

    expect(state.prisma.$transaction).not.toHaveBeenCalled();
    expect(state.inventory.bulkExportInTx).not.toHaveBeenCalled();
  });

  it("JWT scope cũ không cho thao tác sau khi tài khoản đã được gán sang kho khác", async () => {
    const state = makeService({ userWarehouseId: "warehouse-b" });

    await expect(
      state.service.prepareByWarehouse("mission-1", "user-1", "warehouse-a"),
    ).rejects.toThrow("Bạn chỉ được thao tác trên kho thôn được phân công");

    expect(state.prisma.$transaction).not.toHaveBeenCalled();
    expect(state.inventory.bulkExportInTx).not.toHaveBeenCalled();
  });

  it("lỗi hậu commit không biến prepare đã thành công thành response lỗi", async () => {
    jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    const state = makeService({
      recalcError: new Error("readiness unavailable"),
      notificationError: new Error("notification unavailable"),
    });

    await expect(
      state.service.prepareByWarehouse("mission-1", "user-1", "warehouse-a"),
    ).resolves.toEqual(readyMission);
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
