import { MissionStatus, PickupDecision } from "@prisma/client";
import { MissionService } from "../mission.service";

/**
 * Hiện trường báo không cần lấy gì từ kho thì chặng kho phải BIẾN MẤT, không phải
 * biến thành một danh sách rỗng để thủ kho bấm qua.
 */
const mission = {
  id: "mission-1",
  missionNo: 12,
  warehouseId: "warehouse-a",
  incidentType: "FLOOD",
  affectedPeople: 20,
  hamletName: "Thôn Long Châu",
  location: null,
  status: MissionStatus.FIELD_DECIDED,
  allocationPlannedAt: new Date("2026-09-08T00:00:00Z"),
  incidentLat: 13.378,
  incidentLng: 109.104,
  readinessAssessment: { status: "DISPATCHABLE", blockers: [] },
  _count: { requirements: 2 },
  warehouse: { organizationId: "org-1" },
  requirements: [
    {
      sku: "VEST-01",
      itemName: "Áo phao",
      unit: "chiếc",
      pickupDecision: PickupDecision.TAKE_NONE,
      warehouseQuantity: 0,
      heldQuantity: 0,
      heldFromHoldingId: null,
      allocations: [],
    },
    {
      sku: "LIGHT-01",
      itemName: "Đèn pin",
      unit: "chiếc",
      pickupDecision: PickupDecision.TAKE_NONE,
      warehouseQuantity: 0,
      heldQuantity: 0,
      heldFromHoldingId: null,
      allocations: [],
    },
  ],
};

function makeService() {
  const missionModel = {
    findUnique: jest.fn().mockResolvedValue(mission),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    findUniqueOrThrow: jest
      .fn()
      .mockResolvedValue({ ...mission, status: MissionStatus.READY, warehouseStageSkipped: true }),
  };
  const missionWarehousePreparation = { createMany: jest.fn() };
  const missionWarehouseRequest = {
    createMany: jest.fn().mockResolvedValue({ count: 1 }),
    findMany: jest.fn().mockResolvedValue([]),
  };
  const notification = { create: jest.fn().mockResolvedValue({ id: "notification-1" }) };
  const rescueSupplyHolding = { findUnique: jest.fn(), updateMany: jest.fn(), create: jest.fn() };
  const tx = {
    mission: missionModel,
    missionWarehousePreparation,
    missionWarehouseRequest,
    notification,
    rescueSupplyHolding,
  };
  const prisma = {
    mission: missionModel,
    user: { findUnique: jest.fn().mockResolvedValue({ organizationId: "org-1" }) },
    warehouse: {
      findUnique: jest.fn().mockResolvedValue({ organizationId: "org-1" }),
      findMany: jest.fn().mockResolvedValue([{ id: "warehouse-a", name: "Kho A" }]),
    },
    missionWarehouseRequest,
    // Đủ tồn để lượt đối chiếu trước phát hành không chặn — phần cần kiểm ở đây
    // là rẽ nhánh bỏ qua kho, không phải chuyện thiếu hàng.
    itemBatch: {
      findMany: jest.fn().mockResolvedValue([
        {
          quantity: 50,
          item: { sku: "LIGHT-01" },
          shelf: { zone: { warehouseId: "warehouse-a" } },
          loans: [],
        },
      ]),
    },
    $transaction: jest.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
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
  return {
    service,
    missionModel,
    missionWarehousePreparation,
    missionWarehouseRequest,
    notification,
    notifications,
  };
}

describe("phát hành nhiệm vụ không cần kho xuất", () => {
  it("đi thẳng tới READY và đánh dấu đã bỏ qua chặng kho", async () => {
    const state = makeService();

    await state.service.publishPlan("mission-1", "admin-1");

    expect(state.missionModel.updateMany).toHaveBeenCalledWith({
      where: { id: "mission-1", status: MissionStatus.FIELD_DECIDED },
      data: expect.objectContaining({
        status: MissionStatus.READY,
        warehouseStageSkipped: true,
        approvedByUserId: "admin-1",
      }),
    });
  });

  it("KHÔNG tạo dòng tiến độ kho nào", async () => {
    // `missionParticipantWarehouseIds` tự thêm kho nguồn khi không có phân bổ,
    // nên đi qua nó là đẻ ra một dòng "kho phải chuẩn bị" ma trên một nhiệm vụ
    // không kho nào đụng tới.
    const state = makeService();

    await state.service.publishPlan("mission-1", "admin-1");

    expect(state.missionWarehousePreparation.createMany).not.toHaveBeenCalled();
    expect(state.missionWarehouseRequest.createMany).not.toHaveBeenCalled();
  });

  it("chỉ báo hiện trường, KHÔNG báo kho", async () => {
    // Bắt thủ kho bấm "đã chuẩn bị xong" cho một danh sách rỗng chỉ dạy người ta
    // bấm bừa qua các ô xác nhận.
    const state = makeService();

    await state.service.publishPlan("mission-1", "admin-1");

    expect(state.notification.create).toHaveBeenCalledTimes(1);
    expect(state.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        recipientRole: "RESCUE",
        body: expect.stringContaining("Không cần lấy vật tư từ kho"),
      }),
    });
    expect(state.notifications.pushPersisted).toHaveBeenCalledTimes(1);
  });

  it("còn một món phải lấy thì vẫn đi đường kho bình thường", async () => {
    const state = makeService();
    state.missionModel.findUnique.mockResolvedValue({
      ...mission,
      requirements: [
        mission.requirements[0],
        {
          ...mission.requirements[1],
          pickupDecision: PickupDecision.TAKE_PARTIAL,
          warehouseQuantity: 3,
          allocations: [{ batchId: "batch-1", qty: 3, warehouseId: "warehouse-a" }],
        },
      ],
    });

    await state.service.publishPlan("mission-1", "admin-1");

    expect(state.missionModel.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: MissionStatus.PENDING_WAREHOUSE }),
      }),
    );
    expect(state.missionWarehouseRequest.createMany).toHaveBeenCalled();
  });
});
