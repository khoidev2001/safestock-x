import { MissionStatus, PickupDecision } from "@prisma/client";
import { MissionSupplyService } from "../mission-supply.service";

const requirements = [
  { id: "requirement-vest", sku: "VEST-01", itemName: "Áo phao", unit: "chiếc", required: 30 },
  { id: "requirement-light", sku: "LIGHT-01", itemName: "Đèn pin", unit: "chiếc", required: 10 },
];

function makeService(options: { holdings?: unknown[]; status?: MissionStatus } = {}) {
  const mission = {
    id: "mission-1",
    missionNo: 12,
    warehouseId: "warehouse-a",
    incidentType: "FLOOD",
    affectedPeople: 20,
    hamletName: "Thôn Long Châu",
    location: null,
    status: options.status ?? MissionStatus.PENDING_FIELD_DECISION,
    requirements,
  };
  const missionRequirement = {
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    count: jest.fn().mockResolvedValue(0),
    findMany: jest.fn().mockResolvedValue([
      { itemName: "Áo phao", unit: "chiếc", warehouseQuantity: 10 },
      { itemName: "Đèn pin", unit: "chiếc", warehouseQuantity: 0 },
    ]),
  };
  const tx = {
    mission: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    notification: { create: jest.fn().mockResolvedValue({ id: "notification-1" }) },
  };
  const prisma = {
    user: { findUnique: jest.fn().mockResolvedValue({ organizationId: "org-1" }) },
    warehouse: { findUniqueOrThrow: jest.fn().mockResolvedValue({ organizationId: "org-1" }) },
    rescueSupplyHolding: { findMany: jest.fn().mockResolvedValue(options.holdings ?? []) },
    missionRequirement,
    $transaction: jest.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
  };
  const missions = { getMission: jest.fn().mockResolvedValue(mission) };
  const notifications = { pushPersisted: jest.fn() };
  const service = new MissionSupplyService(
    prisma as never,
    missions as never,
    notifications as never,
    {} as never,
  );
  return { service, prisma, missionRequirement, tx, notifications };
}

describe("lực lượng hiện trường chốt số cần lấy từ kho", () => {
  it("lấy hết nghĩa là kho phải xuất đúng số bản tham mưu ghi", async () => {
    const state = makeService();

    await state.service.submitFieldDecisions(
      "mission-1",
      [{ sku: "VEST-01", decision: PickupDecision.TAKE_ALL }],
      "rescue-1",
    );

    expect(state.missionRequirement.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          pickupDecision: PickupDecision.TAKE_ALL,
          warehouseQuantity: 30,
          decidedByUserId: "rescue-1",
        }),
      }),
    );
  });

  it("lấy một phần phải kèm số, và số đó phải nhỏ hơn số cần", async () => {
    const state = makeService();

    await expect(
      state.service.submitFieldDecisions(
        "mission-1",
        [{ sku: "VEST-01", decision: PickupDecision.TAKE_PARTIAL }],
        "rescue-1",
      ),
    ).rejects.toThrow(/phải ghi rõ số lượng/);

    // Gõ đúng bằng số cần thì đó là "lấy hết" — hai con số giống nhau nhưng đọc
    // lại thì một bên là đồng ý với bản tham mưu, bên kia là số tự nghĩ ra.
    await expect(
      state.service.submitFieldDecisions(
        "mission-1",
        [{ sku: "VEST-01", decision: PickupDecision.TAKE_PARTIAL, quantity: 30 }],
        "rescue-1",
      ),
    ).rejects.toThrow(/nhỏ hơn 30/);
  });

  it("phần đội đang giữ bù vào chỗ không lấy từ kho", async () => {
    const state = makeService({
      holdings: [
        {
          id: "holding-1",
          sku: "VEST-01",
          quantity: 20,
          itemName: "Áo phao",
          unit: "chiếc",
        },
      ],
    });

    await state.service.submitFieldDecisions(
      "mission-1",
      [{ sku: "VEST-01", decision: PickupDecision.TAKE_PARTIAL, quantity: 10 }],
      "rescue-1",
    );

    expect(state.missionRequirement.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          warehouseQuantity: 10,
          // Cần 30, lấy 10 từ kho, còn 20 bù bằng hàng đang cầm.
          heldQuantity: 20,
          // MỚI LÀ Ý ĐỊNH: sổ chỉ được chuyển trong transaction phát hành.
          heldFromHoldingId: "holding-1",
        }),
      }),
    );
  });

  it("trả lời hết mọi món thì chuyển sang bước ADMIN lập kế hoạch", async () => {
    const state = makeService();

    await state.service.submitFieldDecisions(
      "mission-1",
      [{ sku: "VEST-01", decision: PickupDecision.TAKE_ALL }],
      "rescue-1",
    );

    expect(state.tx.mission.updateMany).toHaveBeenCalledWith({
      where: { id: "mission-1", status: MissionStatus.PENDING_FIELD_DECISION },
      data: { status: MissionStatus.FIELD_DECIDED },
    });
    expect(state.notifications.pushPersisted).toHaveBeenCalledTimes(1);
  });

  it("còn món chưa trả lời thì chưa chuyển bước và chưa báo điều phối", async () => {
    const state = makeService();
    state.missionRequirement.count.mockResolvedValue(1);

    await state.service.submitFieldDecisions(
      "mission-1",
      [{ sku: "VEST-01", decision: PickupDecision.TAKE_ALL }],
      "rescue-1",
    );

    expect(state.tx.mission.updateMany).not.toHaveBeenCalled();
    expect(state.notifications.pushPersisted).not.toHaveBeenCalled();
  });

  it("chặn chốt số khi nhiệm vụ không ở bước chờ hiện trường", async () => {
    const state = makeService({ status: MissionStatus.PENDING_WAREHOUSE });

    await expect(
      state.service.submitFieldDecisions(
        "mission-1",
        [{ sku: "VEST-01", decision: PickupDecision.TAKE_ALL }],
        "rescue-1",
      ),
    ).rejects.toThrow(/không đang chờ hiện trường chốt số/);
    expect(state.missionRequirement.updateMany).not.toHaveBeenCalled();
  });

  it("chặn món không có trong bản tham mưu", async () => {
    const state = makeService();

    await expect(
      state.service.submitFieldDecisions(
        "mission-1",
        [{ sku: "GHOST-01", decision: PickupDecision.TAKE_ALL }],
        "rescue-1",
      ),
    ).rejects.toThrow(/không có vật tư mã GHOST-01/);
  });
});

describe("kho + phần đang giữ phải phủ kín số cần", () => {
  /** Một khoản đội đang cầm cho đúng SKU đang xét. */
  function holding(sku: string, quantity: number) {
    return { id: `holding-${sku}`, sku, quantity, heldSince: new Date("2026-09-01T00:00:00Z") };
  }

  it("giữ thiếu mà chọn KHÔNG CẦN LẤY thì bị chặn", async () => {
    // Ca hỏng thật: cần 30 áo phao, đội giữ 10, chọn "không cần lấy". Kho không
    // soạn chiếc nào, bản tham mưu vẫn ghi cần 30, còn màn hình điều phối đọc ra
    // "Không cần lấy từ kho · đội đang giữ 10 chiếc" — nghe như đã đủ. Chênh lệch
    // 20 chiếc chỉ lộ ra lúc phát tận tay dân.
    const state = makeService({ holdings: [holding("VEST-01", 10)] });

    await expect(
      state.service.submitFieldDecisions(
        "mission-1",
        [{ sku: "VEST-01", decision: PickupDecision.TAKE_NONE }],
        "rescue-1",
      ),
    ).rejects.toThrow(/ít nhất 20 chiếc/);
    expect(state.missionRequirement.updateMany).not.toHaveBeenCalled();
  });

  it("giữ đủ thì KHÔNG CẦN LẤY vẫn hợp lệ", async () => {
    const state = makeService({ holdings: [holding("VEST-01", 30)] });

    await state.service.submitFieldDecisions(
      "mission-1",
      [{ sku: "VEST-01", decision: PickupDecision.TAKE_NONE }],
      "rescue-1",
    );

    expect(state.missionRequirement.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ warehouseQuantity: 0, heldQuantity: 30 }),
      }),
    );
  });

  it("lấy một phần cũng không được thấp hơn phần còn thiếu", async () => {
    // Cùng một lỗ hổng, chỉ khác cách gõ.
    const state = makeService({ holdings: [holding("VEST-01", 10)] });

    await expect(
      state.service.submitFieldDecisions(
        "mission-1",
        [{ sku: "VEST-01", decision: PickupDecision.TAKE_PARTIAL, quantity: 5 }],
        "rescue-1",
      ),
    ).rejects.toThrow(/ít nhất 20 chiếc/);
  });

  it("không giữ gì thì bắt buộc lấy đủ từ kho", async () => {
    const state = makeService();

    await expect(
      state.service.submitFieldDecisions(
        "mission-1",
        [{ sku: "VEST-01", decision: PickupDecision.TAKE_NONE }],
        "rescue-1",
      ),
    ).rejects.toThrow(/ít nhất 30 chiếc/);
  });
});
