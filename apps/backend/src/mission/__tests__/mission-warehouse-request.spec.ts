import { BadRequestException } from "@nestjs/common";
import {
  MissionStatus,
  MissionWarehouseRequestStatus,
  NotificationKind,
  UserRole,
} from "@prisma/client";
import {
  buildWarehouseRequestCreates,
  requestBatchItems,
  resizeRequestAllocations,
} from "../mission-warehouse-request";
import { MissionWarehouseRequestService } from "../mission-warehouse-request.service";

describe("per-SKU warehouse request helpers", () => {
  const requirements = [
    {
      sku: "WATER-01",
      itemName: "Nước uống",
      unit: "chai",
      allocations: [
        { batchId: "batch-a1", qty: 4, warehouseId: "warehouse-a" },
        { batchId: "batch-a2", qty: 2, warehouseId: "warehouse-a" },
        { batchId: "batch-b1", qty: 3, warehouseId: "warehouse-b" },
      ],
    },
  ];

  it("materializes one request per warehouse and SKU from authoritative allocations", () => {
    expect(buildWarehouseRequestCreates("mission-1", requirements)).toEqual([
      {
        missionId: "mission-1",
        warehouseId: "warehouse-a",
        sku: "WATER-01",
        itemName: "Nước uống",
        unit: "chai",
        requestedQuantity: 6,
        allocations: [
          { batchId: "batch-a1", qty: 4, warehouseId: "warehouse-a" },
          { batchId: "batch-a2", qty: 2, warehouseId: "warehouse-a" },
        ],
      },
      {
        missionId: "mission-1",
        warehouseId: "warehouse-b",
        sku: "WATER-01",
        itemName: "Nước uống",
        unit: "chai",
        requestedQuantity: 3,
        allocations: [{ batchId: "batch-b1", qty: 3, warehouseId: "warehouse-b" }],
      },
    ]);
  });

  it("resizes only downward and preserves deterministic batch order", () => {
    expect(resizeRequestAllocations(requirements[0].allocations, 5)).toEqual([
      { batchId: "batch-a1", qty: 4, warehouseId: "warehouse-a" },
      { batchId: "batch-a2", qty: 1, warehouseId: "warehouse-a" },
    ]);
    expect(() => resizeRequestAllocations(requirements[0].allocations, 10)).toThrow(
      "Số lượng vượt quá phần vật tư đã được phân bổ",
    );
    expect(requestBatchItems(requirements[0].allocations)).toEqual([
      { batchId: "batch-a1", quantity: 4 },
      { batchId: "batch-a2", quantity: 2 },
      { batchId: "batch-b1", quantity: 3 },
    ]);
  });
});

describe("MissionWarehouseRequestService concurrency", () => {
  it("ADMIN review cannot reset a request after warehouse prepare has won the claim", async () => {
    const stale = {
      id: "request-1",
      missionId: "mission-1",
      warehouseId: "warehouse-a",
      status: MissionWarehouseRequestStatus.ACCEPTED,
      preparationClaimToken: null,
      updatedAt: new Date("2026-07-29T02:00:00.000Z"),
      allocations: [{ batchId: "batch-a1", qty: 4, warehouseId: "warehouse-a" }],
    };
    const missionWarehouseRequest = {
      findFirst: jest.fn().mockResolvedValue(stale),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      findUnique: jest.fn().mockResolvedValue({
        ...stale,
        status: MissionWarehouseRequestStatus.PREPARED,
        preparationClaimToken: null,
      }),
    };
    const tx = { missionWarehouseRequest };
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ organizationId: "org-1" }),
      },
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const service = new MissionWarehouseRequestService(prisma as never, {} as never, {} as never);

    await expect(
      service.review("request-1", "admin-1", {
        requestedQuantity: 3,
        adminNote: "Giảm theo tồn thực tế",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(missionWarehouseRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "request-1",
          status: {
            in: [MissionWarehouseRequestStatus.PENDING, MissionWarehouseRequestStatus.ACCEPTED],
          },
          preparationClaimToken: null,
          updatedAt: stale.updatedAt,
        }),
      }),
    );
  });

  it("per-SKU prepare exports once, completes warehouse summary, then makes mission READY", async () => {
    const request = {
      id: "request-1",
      missionId: "mission-1",
      warehouseId: "warehouse-a",
      sku: "WATER-01",
      itemName: "Nước uống",
      unit: "chai",
      requestedQuantity: 4,
      allocations: [{ batchId: "batch-a1", qty: 4, warehouseId: "warehouse-a" }],
      status: MissionWarehouseRequestStatus.ACCEPTED,
      preparedAt: null,
      preparationClaimToken: null,
      warehouse: { organizationId: "org-1" },
      mission: { status: MissionStatus.PENDING_WAREHOUSE },
    };
    const prepared = {
      ...request,
      status: MissionWarehouseRequestStatus.PREPARED,
      preparedQuantity: 4,
      preparedAt: new Date(),
    };
    const missionWarehouseRequest = {
      findFirst: jest.fn().mockResolvedValue(request),
      updateMany: jest.fn().mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 1 }),
      count: jest.fn().mockResolvedValueOnce(0).mockResolvedValueOnce(0),
      findUniqueOrThrow: jest.fn().mockResolvedValue(prepared),
    };
    const tx = {
      missionWarehouseRequest,
      missionWarehousePreparation: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      mission: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      $executeRawUnsafe: jest.fn().mockResolvedValue(0),
    };
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ warehouseId: "warehouse-a" }) },
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const inventory = {
      bulkExportInTx: jest.fn().mockResolvedValue({ count: 1 }),
      recalcBatches: jest.fn().mockResolvedValue(undefined),
    };
    const notifications = { create: jest.fn().mockResolvedValue({}) };
    const service = new MissionWarehouseRequestService(
      prisma as never,
      inventory as never,
      notifications as never,
    );

    await expect(service.prepare("request-1", "warehouse-user", "warehouse-a")).resolves.toEqual(
      prepared,
    );
    expect(inventory.bulkExportInTx).toHaveBeenCalledWith(
      tx,
      "warehouse-user",
      [{ batchId: "batch-a1", quantity: 4 }],
      "Yêu cầu vật tư request-1",
      "warehouse-a",
    );
    expect(tx.missionWarehousePreparation.updateMany).toHaveBeenCalledWith({
      where: { missionId: "mission-1", warehouseId: "warehouse-a", preparedAt: null },
      data: { preparedByUserId: "warehouse-user", preparedAt: expect.any(Date) },
    });
    expect(tx.mission.updateMany).toHaveBeenCalledWith({
      where: { id: "mission-1", status: MissionStatus.PENDING_WAREHOUSE },
      data: { status: MissionStatus.READY },
    });
    // H2: finalize per-SKU phải giữ advisory lock trên mission trước khi đếm remaining.
    expect(tx.$executeRawUnsafe).toHaveBeenCalledWith(
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
      "mission-prepare:mission-1",
    );
    const lockOrder = tx.$executeRawUnsafe.mock.invocationCallOrder[0];
    const countOrder = missionWarehouseRequest.count.mock.invocationCallOrder[0];
    expect(lockOrder).toBeLessThan(countOrder);
  });

  it("món đã có người ký nhận vẫn tính là kho đã xuất khi chốt món cuối", async () => {
    // Đúng kịch bản đã làm hỏng nhiệm vụ thật: kho soạn món 1, người đi lấy ký
    // nhận ngay (PICKED_UP), rồi kho soạn nốt món 2. Phép đếm cũ hỏi "khác
    // PREPARED" nên vẫn thấy món 1 là còn nợ: tiến độ kho đứng ở 0/2 và nhiệm vụ
    // kẹt mãi ở PENDING_WAREHOUSE, đội hiện trường không bao giờ đóng được.
    const request = {
      id: "request-2",
      missionId: "mission-1",
      warehouseId: "warehouse-a",
      sku: "TORCH-01",
      itemName: "Đèn pin",
      unit: "chiếc",
      requestedQuantity: 1,
      allocations: [{ batchId: "batch-a2", qty: 1, warehouseId: "warehouse-a" }],
      status: MissionWarehouseRequestStatus.ACCEPTED,
      preparedAt: null,
      preparationClaimToken: null,
      warehouse: { organizationId: "org-1" },
      mission: { status: MissionStatus.PENDING_WAREHOUSE },
    };
    const prepared = {
      ...request,
      status: MissionWarehouseRequestStatus.PREPARED,
      preparedQuantity: 1,
      preparedAt: new Date(),
    };
    const missionWarehouseRequest = {
      findFirst: jest.fn().mockResolvedValue(request),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      // Món 1 đang PICKED_UP nên KHÔNG được rơi vào phép đếm phần còn nợ.
      count: jest.fn().mockResolvedValue(0),
      findUniqueOrThrow: jest.fn().mockResolvedValue(prepared),
    };
    const tx = {
      missionWarehouseRequest,
      missionWarehousePreparation: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      mission: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      $executeRawUnsafe: jest.fn().mockResolvedValue(0),
    };
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ warehouseId: "warehouse-a" }) },
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const service = new MissionWarehouseRequestService(
      prisma as never,
      {
        bulkExportInTx: jest.fn().mockResolvedValue({ count: 1 }),
        recalcBatches: jest.fn().mockResolvedValue(undefined),
      } as never,
      { create: jest.fn().mockResolvedValue({}) } as never,
    );

    await service.prepare("request-2", "warehouse-user", "warehouse-a");

    const unexported = {
      in: [MissionWarehouseRequestStatus.PENDING, MissionWarehouseRequestStatus.ACCEPTED],
    };
    expect(missionWarehouseRequest.count).toHaveBeenCalledWith({
      where: { missionId: "mission-1", warehouseId: "warehouse-a", status: unexported },
    });
    expect(missionWarehouseRequest.count).toHaveBeenCalledWith({
      where: { missionId: "mission-1", status: unexported },
    });
    expect(tx.missionWarehousePreparation.updateMany).toHaveBeenCalled();
    expect(tx.mission.updateMany).toHaveBeenCalledWith({
      where: { id: "mission-1", status: MissionStatus.PENDING_WAREHOUSE },
      data: { status: MissionStatus.READY },
    });
  });

  it("kho xong phần của mình thì gọi đội tới lấy ngay, không đợi các kho còn lại", async () => {
    // Một nhiệm vụ trải qua nhiều kho; kho xong sớm có thể xong trước kho cuối cả
    // buổi. Đợi đủ mới báo là để hàng nằm trên kệ trong khi đội hoàn toàn chạy
    // được một chuyến trước.
    const harness = prepareHarness({ remainingForWarehouse: 0, remainingForMission: 2 });
    await harness.service.prepare("request-1", "warehouse-user", "warehouse-a");

    const rescueNotifications = harness.notifications.create.mock.calls
      .map(([input]) => input)
      .filter((input) => input.recipientRole === UserRole.RESCUE);
    expect(rescueNotifications).toHaveLength(1);
    expect(rescueNotifications[0].title).toBe("Kho đã chuẩn bị xong — tới lấy hàng");
    expect(rescueNotifications[0].body).toContain("Nhiệm vụ số 145");
    expect(rescueNotifications[0].body).toContain("Kho thôn Long Châu");
    expect(rescueNotifications[0].body).toContain("ký nhận");
  });

  it("kho cuối xong thì gộp thành MỘT câu 'toàn bộ đã sẵn sàng'", async () => {
    // Hai thông báo sát nhau nói gần như cùng một điều thì cái sau chỉ làm loãng
    // cái trước.
    const harness = prepareHarness({ remainingForWarehouse: 0, remainingForMission: 0 });
    await harness.service.prepare("request-1", "warehouse-user", "warehouse-a");

    const rescueNotifications = harness.notifications.create.mock.calls
      .map(([input]) => input)
      .filter((input) => input.recipientRole === UserRole.RESCUE);
    expect(rescueNotifications).toHaveLength(1);
    expect(rescueNotifications[0].title).toBe("Toàn bộ vật tư đã sẵn sàng");
    expect(rescueNotifications[0].body).toContain("Nhiệm vụ số 145");
  });

  it("kho mới xong một món trong nhiều món thì CHƯA gọi đội", async () => {
    const harness = prepareHarness({ remainingForWarehouse: 1, remainingForMission: 3 });
    await harness.service.prepare("request-1", "warehouse-user", "warehouse-a");

    expect(
      harness.notifications.create.mock.calls
        .map(([input]) => input)
        .filter((input) => input.recipientRole === UserRole.RESCUE),
    ).toHaveLength(0);
  });
});

describe("MissionWarehouseRequestService.confirmPickup — thông báo ký nhận", () => {
  /** `conChuaKyNhan`: số phiếu của nhiệm vụ chưa ai ký nhận, tính SAU lượt ký này. */
  function harness(preparedQuantity: number, awaitingPickupCount = 1) {
    const request = {
      id: "request-1",
      missionId: "mission-1",
      warehouseId: "warehouse-a",
      sku: "WATER-01",
      itemName: "Nước uống",
      unit: "chai",
      preparedQuantity,
      status: MissionWarehouseRequestStatus.PREPARED,
      warehouse: { id: "warehouse-a", name: "Kho thôn Long Hà", organizationId: "org-1" },
    };
    const notifications = { create: jest.fn().mockResolvedValue({}) };
    const prisma = {
      missionWarehouseRequest: {
        findUnique: jest.fn().mockResolvedValue(request),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue(request),
        count: jest.fn().mockResolvedValue(awaitingPickupCount),
      },
      mission: { findUnique: jest.fn().mockResolvedValue({ missionNo: 145 }) },
      // Người ký nhận phải cùng đơn vị với kho giữ phiếu; bản giả trả về đúng
      // đơn vị đó để các kịch bản dưới đây kiểm nội dung thông báo, không phải
      // kiểm lại lượt chặn xuyên xã (đã có E2E lo).
      user: { findUnique: jest.fn().mockResolvedValue({ organizationId: "org-1" }) },
    };
    const service = new MissionWarehouseRequestService(
      prisma as never,
      { recalcBatches: jest.fn() } as never,
      notifications as never,
    );
    return { service, notifications };
  }

  it("lấy ĐỦ vẫn báo điều phối — trước đây kho xuất xong mà bảng điều phối im lặng", async () => {
    const { service, notifications } = harness(40);

    await service.confirmPickup("request-1", "warehouse-user", 40, null, "warehouse-a");

    expect(notifications.create).toHaveBeenCalledTimes(1);
    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: NotificationKind.WAREHOUSE_READY,
        title: "Đội cứu hộ đã lấy hàng",
        missionId: "mission-1",
        warehouseId: "warehouse-a",
        organizationId: "org-1",
      }),
    );
  });

  it("ký nhận nốt phiếu cuối thì gọi đội báo kết quả — mốc mở ô báo cáo", async () => {
    // `READY` chỉ nói kho đã xuất ra khỏi sổ; chữ ký nhận mới là lúc hàng nằm
    // trong tay người đi giao. Thông báo này cũng là tín hiệu để màn chi tiết
    // trên máy họ mở ô báo cáo ra ngay, khỏi thoát ra vào lại.
    const { service, notifications } = harness(40, 0);

    await service.confirmPickup("request-1", "warehouse-user", 40, null, "warehouse-a");

    const callRescueTeam = notifications.create.mock.calls
      .map(([input]) => input)
      .filter((input) => input.recipientRole === UserRole.RESCUE);
    expect(callRescueTeam).toHaveLength(1);
    expect(callRescueTeam[0].title).toBe("Đã nhận đủ vật tư — báo kết quả để đóng nhiệm vụ");
    expect(callRescueTeam[0].body).toContain("Nhiệm vụ số 145");
  });

  it("còn phiếu chưa ký nhận thì CHƯA gọi đội báo kết quả", async () => {
    const { service, notifications } = harness(40, 2);

    await service.confirmPickup("request-1", "warehouse-user", 40, null, "warehouse-a");

    expect(
      notifications.create.mock.calls
        .map(([input]) => input)
        .filter((input) => input.recipientRole === UserRole.RESCUE),
    ).toHaveLength(0);
  });

  it("lấy THIẾU chỉ ra MỘT thông báo, và tiêu đề nói thẳng là thiếu", async () => {
    // Gửi kèm cả thông báo "đã lấy hàng" thì lần thiếu chìm trong tiếng ồn của lần
    // đủ — đúng cái bẫy mà việc chỉ-báo-khi-thiếu ngày trước sinh ra để tránh.
    const { service, notifications } = harness(40);

    await service.confirmPickup(
      "request-1",
      "warehouse-user",
      30,
      "Xe chỉ chở được 30",
      "warehouse-a",
    );

    expect(notifications.create).toHaveBeenCalledTimes(1);
    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Lấy hàng THIẾU so với số đã soạn" }),
    );
  });
});

/** Dựng MissionWarehouseRequestService quanh một lượt prepare, chỉnh được phần "còn nợ". */
function prepareHarness(counts: { remainingForWarehouse: number; remainingForMission: number }) {
  const request = {
    id: "request-1",
    missionId: "mission-1",
    warehouseId: "warehouse-a",
    sku: "WATER-01",
    itemName: "Nước uống",
    unit: "chai",
    requestedQuantity: 4,
    allocations: [{ batchId: "batch-a1", qty: 4, warehouseId: "warehouse-a" }],
    status: MissionWarehouseRequestStatus.ACCEPTED,
    preparedAt: null,
    preparationClaimToken: null,
    warehouse: { organizationId: "org-1", name: "Kho thôn Long Châu" },
    mission: { status: MissionStatus.PENDING_WAREHOUSE, missionNo: 145 },
  };
  const missionWarehouseRequest = {
    findFirst: jest.fn().mockResolvedValue(request),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    count: jest
      .fn()
      .mockResolvedValueOnce(counts.remainingForWarehouse)
      .mockResolvedValueOnce(counts.remainingForMission),
    findUniqueOrThrow: jest.fn().mockResolvedValue({
      ...request,
      status: MissionWarehouseRequestStatus.PREPARED,
      preparedQuantity: 4,
      preparedAt: new Date(),
    }),
  };
  const tx = {
    missionWarehouseRequest,
    missionWarehousePreparation: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    mission: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    $executeRawUnsafe: jest.fn().mockResolvedValue(0),
  };
  const prisma = {
    user: { findUnique: jest.fn().mockResolvedValue({ warehouseId: "warehouse-a" }) },
    $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
  };
  const notifications = { create: jest.fn().mockResolvedValue({}) };
  const service = new MissionWarehouseRequestService(
    prisma as never,
    {
      bulkExportInTx: jest.fn().mockResolvedValue({ count: 1 }),
      recalcBatches: jest.fn().mockResolvedValue(undefined),
    } as never,
    notifications as never,
  );
  return { service, notifications, tx };
}
