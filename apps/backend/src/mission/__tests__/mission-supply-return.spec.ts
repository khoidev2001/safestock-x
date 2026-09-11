import { BadRequestException } from "@nestjs/common";
import { MissionStatus, UserRole } from "@prisma/client";
import { MissionService } from "../mission.service";

/**
 * Kho đếm lại vật tư tái sử dụng khi đội cứu hộ mang đồ về.
 *
 * Hai điều phải giữ bằng mọi giá:
 *
 *  - Trả CHƯA ĐỦ vẫn được ghi số ngay, và nhiệm vụ KHÔNG khép sổ. Khép sổ khi còn
 *    hàng ở ngoài là tuyên bố sai trên giấy tờ, và phần thiếu sẽ không bao giờ
 *    được ai đòi.
 *  - Hàng TIÊU HAO không bị hỏi "trả bao nhiêu". Mì tôm đã phát cho dân thì không
 *    có gì để trả; bày nó ra là mời người trực khai một khoản thiếu không có thật.
 */

const MISSION_ID = "mission-1";

function requestRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "request-vest",
    sku: "VEST-ADULT",
    itemName: "Áo phao người lớn",
    unit: "chiếc",
    warehouseId: "warehouse-a",
    pickedUpQuantity: 10,
    returnedQuantity: null as number | null,
    warehouse: { id: "warehouse-a", name: "Kho thôn Long Châu" },
    ...overrides,
  };
}

function makeService(requests: Record<string, unknown>[], items?: Record<string, unknown>[]) {
  const missionWarehouseRequest = {
    findMany: jest.fn().mockImplementation(() => Promise.resolve(requests)),
    update: jest.fn().mockImplementation((args: unknown) => Promise.resolve(args)),
    count: jest.fn().mockResolvedValue(1),
  };
  const prisma = {
    mission: {
      findUnique: jest.fn().mockResolvedValue({
        id: MISSION_ID,
        missionNo: 824,
        warehouseId: "warehouse-a",
        status: MissionStatus.COMPLETED,
      }),
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        id: MISSION_ID,
        missionNo: 824,
        status: MissionStatus.COMPLETED,
      }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue({
        role: UserRole.WAREHOUSE,
        organizationId: "org-1",
      }),
    },
    warehouse: { findUnique: jest.fn().mockResolvedValue({ organizationId: "org-1" }) },
    item: {
      findMany: jest.fn().mockResolvedValue(
        items ?? [
          { sku: "VEST-ADULT", consumable: false },
          { sku: "NOODLE-01", consumable: true },
        ],
      ),
    },
    missionWarehouseRequest,
    $transaction: jest
      .fn()
      .mockImplementation((operations: unknown[]) => Promise.resolve(operations)),
  };
  const notifications = { create: jest.fn().mockResolvedValue({}) };
  const service = new MissionService(
    prisma as never,
    {} as never,
    notifications as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  return { service, prisma, notifications, missionWarehouseRequest };
}

describe("kho xác nhận hoàn trả vật tư", () => {
  it("trả CHƯA ĐỦ thì ghi số nhưng KHÔNG khép sổ nhiệm vụ", async () => {
    const state = makeService([requestRow({ returnedQuantity: null })]);
    // Lượt đọc sau khi ghi: mới trả 6 trên 10 chiếc.
    state.missionWarehouseRequest.findMany
      .mockResolvedValueOnce([requestRow()])
      .mockResolvedValueOnce([requestRow({ returnedQuantity: 6 })]);

    const result = await state.service.markReturnedByWarehouse(
      MISSION_ID,
      "user-1",
      "warehouse-a",
      {
        items: [{ sku: "VEST-ADULT", returnedQuantity: 6 }],
      },
    );

    expect(state.missionWarehouseRequest.update).toHaveBeenCalledWith({
      where: { id: "request-vest" },
      data: expect.objectContaining({ returnedQuantity: 6 }),
    });
    // Nhiệm vụ vẫn đứng ở COMPLETED: còn 4 chiếc áo phao chưa về.
    expect(state.prisma.mission.updateMany).not.toHaveBeenCalled();
    expect(result.outstandingReturns).toEqual([
      expect.objectContaining({ sku: "VEST-ADULT", outstandingQuantity: 4 }),
    ]);
    // Chưa khép sổ thì chưa báo "không còn bước nào phải làm".
    expect(state.notifications.create).not.toHaveBeenCalled();
  });

  it("trả đủ từng dòng thì khép sổ và báo cho điều phối lẫn đội cứu hộ", async () => {
    const state = makeService([requestRow()]);
    state.missionWarehouseRequest.findMany
      .mockResolvedValueOnce([requestRow()])
      .mockResolvedValueOnce([requestRow({ returnedQuantity: 10 })]);

    await state.service.markReturnedByWarehouse(MISSION_ID, "user-1", "warehouse-a", {
      items: [{ sku: "VEST-ADULT", returnedQuantity: 10 }],
    });

    expect(state.prisma.mission.updateMany).toHaveBeenCalledWith({
      where: { id: MISSION_ID, status: MissionStatus.COMPLETED },
      data: expect.objectContaining({ status: MissionStatus.RETURNED }),
    });
    expect(state.notifications.create).toHaveBeenCalledTimes(2);
  });

  it("bấm 'đã hoàn trả đủ' mà không khai dòng nào thì mọi dòng tái sử dụng về đủ", async () => {
    // Đường một nút bấm đã có từ trước phải giữ nguyên hành vi: kho ký một cái là
    // nhiệm vụ đóng, không bắt họ đếm từng dòng khi hàng đã về đủ.
    const state = makeService([requestRow()]);
    state.missionWarehouseRequest.findMany
      .mockResolvedValueOnce([requestRow()])
      .mockResolvedValueOnce([requestRow({ returnedQuantity: 10 })]);

    await state.service.markReturnedByWarehouse(MISSION_ID, "user-1", "warehouse-a");

    expect(state.missionWarehouseRequest.update).toHaveBeenCalledWith({
      where: { id: "request-vest" },
      data: expect.objectContaining({ returnedQuantity: 10 }),
    });
    expect(state.prisma.mission.updateMany).toHaveBeenCalled();
  });

  it("không nhận số trả lớn hơn số đã giao ra", async () => {
    // Nhận về nhiều hơn số đã đưa đi là gõ nhầm, và nếu lọt thì tồn kho trên sổ
    // phình ra một khoản không ai nhập.
    const state = makeService([requestRow()]);

    await expect(
      state.service.markReturnedByWarehouse(MISSION_ID, "user-1", "warehouse-a", {
        items: [{ sku: "VEST-ADULT", returnedQuantity: 11 }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("hàng tiêu hao không nằm trong danh sách phải trả", async () => {
    const state = makeService([
      requestRow(),
      requestRow({
        id: "request-noodle",
        sku: "NOODLE-01",
        itemName: "Mì tôm cứu trợ",
        unit: "thùng",
        pickedUpQuantity: 5,
      }),
    ]);

    const result = await state.service.listReturnableSupplies(MISSION_ID, "user-1", "warehouse-a");

    expect(result.items.map((item) => item.sku)).toEqual(["VEST-ADULT"]);
    expect(result.items[0]).toEqual(
      expect.objectContaining({ handedOverQuantity: 10, outstandingQuantity: 10 }),
    );
  });

  it("kho không khai hộ được dòng của kho khác", async () => {
    const state = makeService([requestRow({ warehouseId: "warehouse-b" })]);

    await expect(
      state.service.markReturnedByWarehouse(MISSION_ID, "user-1", "warehouse-a", {
        items: [{ sku: "VEST-ADULT", returnedQuantity: 3 }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
