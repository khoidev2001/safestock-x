import { BadRequestException } from "@nestjs/common";
import { MissionStatus, MissionWarehouseRequestStatus } from "@prisma/client";
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
});
