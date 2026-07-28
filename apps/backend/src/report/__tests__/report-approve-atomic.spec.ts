import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Logger,
} from "@nestjs/common";
import { LoanStatus, ReportStatus } from "@prisma/client";
import { InventoryAdjustmentService } from "../../inventory/inventory-adjustment.service";
import { ReportService } from "../report.service";

const reportId = "report-1";
const actorId = "admin-1";
const warehouseId = "warehouse-1";
const sku = "SKU-1";

describe("ReportService.approve atomic", () => {
  it("reconciles the exact batch declared by a batch-level count", async () => {
    const state = makeState({
      rows: [{ sku, batchId: "batch-b", quantity: 3 }],
    });

    const result = await state.service.approve(reportId, actorId);

    expect(result.applied).toEqual([
      { sku, batchId: "batch-b", countedQty: 3 },
    ]);
    expect(reconcileTargets(state)).toEqual([
      { batchId: "batch-b", countedQty: 3 },
    ]);
  });

  it("rejects a legacy SKU-level count when the SKU has multiple batches", async () => {
    const state = makeState({ rows: [{ sku, quantity: 4 }] });

    await expect(state.service.approve(reportId, actorId)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(state.adjustment.reconcileInTx).not.toHaveBeenCalled();
    expect(state.tx.auditLog.create).not.toHaveBeenCalled();
  });

  it("rejects a missing SKU instead of approving a report with skipped rows", async () => {
    const state = makeState({
      rows: [{ sku: "MISSING", quantity: 3 }],
      batchesBySku: { MISSING: [] },
    });

    await expect(state.service.approve(reportId, actorId)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(state.adjustment.reconcileInTx).not.toHaveBeenCalled();
    expect(state.tx.auditLog.create).not.toHaveBeenCalled();
  });

  it("accepts two rows for the same SKU when they identify distinct batches", async () => {
    const state = makeState({
      rows: [
        { sku, batchId: "batch-a", quantity: 2 },
        { sku, batchId: "batch-b", quantity: 4 },
      ],
    });

    await expect(state.service.approve(reportId, actorId)).resolves.toEqual(
      expect.objectContaining({
        applied: [
          { sku, batchId: "batch-a", countedQty: 2 },
          { sku, batchId: "batch-b", countedQty: 4 },
        ],
      }),
    );
  });

  it("accepts a legacy SKU-level row only when the SKU has exactly one batch", async () => {
    const state = makeState({
      rows: [{ sku, quantity: 4 }],
      batchesBySku: { [sku]: [batch("batch-a", 5)] },
    });

    const result = await state.service.approve(reportId, actorId);

    expect(result).toEqual({
      id: reportId,
      status: ReportStatus.APPROVED,
      applied: [{ sku, batchId: "batch-a", countedQty: 4 }],
    });
    expect(state.adjustment.reconcileInTx).toHaveBeenCalledTimes(1);
    expect(state.adjustment.reconcileInTx).toHaveBeenCalledWith(
      state.tx,
      actorId,
      "batch-a",
      4,
      true,
      expect.stringContaining("2026-07"),
      warehouseId,
      {
        requireStableSnapshot: true,
        expectedBatch: { quantity: 5, circulation: "IN_STOCK" },
      },
    );
    expect(state.tx.itemBatch.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: 2,
      }),
    );
    expect(state.tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId,
        action: "REPORT_APPROVE",
        entity: "MonthlyStockReport",
        entityId: reportId,
        metadata: expect.objectContaining({
          warehouseId,
          period: "2026-07",
          skuCount: 1,
          reconciledBatchCount: 1,
          skippedSkus: [],
        }),
      }),
    });
    expect(state.adjustment.recalculateWarehousesAfterCommit).toHaveBeenCalledTimes(1);
    expect(state.adjustment.recalculateWarehousesAfterCommit).toHaveBeenCalledWith([warehouseId]);
  });

  it("passes an exact batch snapshot with open loans to reconciliation", async () => {
    const state = makeState({
      rows: [{ sku, batchId: "batch-a", quantity: 6 }],
      batchesBySku: {
        [sku]: [batch("batch-a", 8, [loan(3)])],
      },
    });

    await state.service.approve(reportId, actorId);

    expect(reconcileTargets(state)).toEqual([
      { batchId: "batch-a", countedQty: 6 },
    ]);
  });

  it("locks loan writes before reading approval batches", async () => {
    const state = makeState();

    await state.service.approve(reportId, actorId);

    expect(state.tx.$executeRawUnsafe).toHaveBeenCalledWith(
      'LOCK TABLE "LoanRecord" IN SHARE MODE',
    );
    expect(state.tx.$executeRawUnsafe.mock.invocationCallOrder[0]).toBeLessThan(
      state.tx.itemBatch.findFirst.mock.invocationCallOrder[0],
    );
  });

  it("processes SKUs in a stable order while preserving response row order", async () => {
    const state = makeState({
      rows: [
        { sku: "SKU-Z", batchId: "batch-z", quantity: 2 },
        { sku: "SKU-A", batchId: "batch-a", quantity: 1 },
      ],
      batchesBySku: {
        "SKU-Z": [batch("batch-z", 2)],
        "SKU-A": [batch("batch-a", 1)],
      },
    });

    const result = await state.service.approve(reportId, actorId);

    expect(state.tx.itemBatch.findFirst.mock.calls.map((call) => call[0].where.item.sku)).toEqual([
      "SKU-A",
      "SKU-Z",
    ]);
    expect(result.applied.map((item) => item.sku)).toEqual(["SKU-Z", "SKU-A"]);
  });

  it("rejects duplicate persisted batch rows before reconcile or audit writes", async () => {
    const state = makeState({
      rows: [
        { sku, batchId: "batch-a", quantity: 3 },
        { sku: ` ${sku.toLowerCase()} `, batchId: "batch-a", quantity: 4 },
      ],
    });

    await expect(state.service.approve(reportId, actorId)).rejects.toBeInstanceOf(
      BadRequestException,
    );

    expect(state.adjustment.reconcileInTx).not.toHaveBeenCalled();
    expect(state.tx.$executeRawUnsafe).not.toHaveBeenCalled();
    expect(state.tx.itemBatch.findMany).not.toHaveBeenCalled();
    expect(state.tx.auditLog.create).not.toHaveBeenCalled();
    expect(state.adjustment.recalculateWarehousesAfterCommit).not.toHaveBeenCalled();
  });

  it("approved retry returns an empty applied list with zero new writes", async () => {
    const state = makeState({ status: ReportStatus.APPROVED });

    await expect(state.service.approve(reportId, actorId)).resolves.toEqual({
      id: reportId,
      status: ReportStatus.APPROVED,
      applied: [],
    });

    expect(state.tx.monthlyStockReport.updateMany).not.toHaveBeenCalled();
    expect(state.tx.$executeRawUnsafe).not.toHaveBeenCalled();
    expect(state.tx.itemBatch.findMany).not.toHaveBeenCalled();
    expect(state.adjustment.reconcileInTx).not.toHaveBeenCalled();
    expect(state.tx.auditLog.create).not.toHaveBeenCalled();
    expect(state.adjustment.recalculateWarehousesAfterCommit).not.toHaveBeenCalled();
  });

  it("blocks an actor from another organization before claiming the report", async () => {
    const state = makeState({ actorOrganizationId: "org-foreign" });

    await expect(state.service.approve(reportId, actorId)).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    expect(state.tx.monthlyStockReport.updateMany).not.toHaveBeenCalled();
    expect(state.tx.$executeRawUnsafe).not.toHaveBeenCalled();
    expect(state.adjustment.reconcileInTx).not.toHaveBeenCalled();
    expect(state.tx.auditLog.create).not.toHaveBeenCalled();
  });

  it("keeps approval successful when post-commit readiness fails", async () => {
    jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    const state = makeState({ rows: [{ sku, batchId: "batch-a", quantity: 4 }] });
    const readiness = {
      recalculateWarehouse: jest.fn().mockRejectedValue(new Error("readiness unavailable")),
    };
    const adjustment = new InventoryAdjustmentService({} as never, readiness as never);
    jest.spyOn(adjustment, "reconcileInTx").mockResolvedValue({
      batchId: "batch-a",
      expectedInStock: 5,
      countedQty: 4,
      onLoan: 0,
      discrepancy: -1,
      applied: true,
    });
    const service = new ReportService(state.prisma as never, adjustment);

    await expect(service.approve(reportId, actorId)).resolves.toEqual(
      expect.objectContaining({ id: reportId, status: ReportStatus.APPROVED }),
    );
    expect(readiness.recalculateWarehouse).toHaveBeenCalledTimes(1);
    expect(readiness.recalculateWarehouse).toHaveBeenCalledWith(warehouseId);
  });

  it("claims PENDING inside the transaction and scopes the actor query", async () => {
    const state = makeState();

    await state.service.approve(reportId, actorId);

    expect(state.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(state.tx.user.findUnique).toHaveBeenCalledWith({
      where: { id: actorId },
      select: { organizationId: true },
    });
    expect(state.tx.monthlyStockReport.updateMany).toHaveBeenCalledWith({
      where: { id: reportId, status: ReportStatus.PENDING },
      data: {
        status: ReportStatus.APPROVED,
        approvedByUserId: actorId,
        approvedAt: expect.any(Date),
      },
    });
  });
});

describe("ReportService.reject atomic", () => {
  it("uses a conditional PENDING transition", async () => {
    const state = makeState();

    await state.service.reject(reportId, actorId, "invalid count");

    expect(state.tx.monthlyStockReport.updateMany).toHaveBeenCalledWith({
      where: { id: reportId, status: ReportStatus.PENDING },
      data: {
        status: ReportStatus.REJECTED,
        approvedByUserId: actorId,
        approvedAt: expect.any(Date),
        note: "invalid count",
      },
    });
  });

  it("rejects a lost conditional claim", async () => {
    const state = makeState({ claimCount: 0 });

    await expect(state.service.reject(reportId, actorId)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

type ApprovalRow = { sku: string; batchId?: string; quantity: number };
type BatchFixture = ReturnType<typeof batch>;

function makeState(
  options: {
    status?: ReportStatus;
    currentStatus?: ReportStatus;
    rows?: ApprovalRow[];
    batchesBySku?: Record<string, BatchFixture[]>;
    actorOrganizationId?: string;
    warehouseOrganizationId?: string;
    claimCount?: number;
  } = {},
) {
  const status = options.status ?? ReportStatus.PENDING;
  const report = {
    id: reportId,
    warehouseId,
    submittedByUserId: "submitter-1",
    period: "2026-07",
    status,
    rows: options.rows ?? [{ sku, batchId: "batch-a", quantity: 4 }],
    note: null,
    approvedByUserId: null,
    approvedAt: null,
    createdAt: new Date("2026-07-01T00:00:00.000Z"),
    warehouse: { organizationId: options.warehouseOrganizationId ?? "org-1" },
  };
  const defaultBatches = [batch("batch-a", 5), batch("batch-b", 7)];
  const tx = {
    $executeRawUnsafe: jest.fn().mockResolvedValue(0),
    user: {
      findUnique: jest.fn().mockResolvedValue({
        organizationId: options.actorOrganizationId ?? "org-1",
      }),
    },
    monthlyStockReport: {
      findUnique: jest.fn().mockImplementation((args: { select?: { status?: boolean } }) => {
        if (args.select?.status) return { status: options.currentStatus ?? status };
        return report;
      }),
      updateMany: jest.fn().mockResolvedValue({ count: options.claimCount ?? 1 }),
    },
    itemBatch: {
      findFirst: jest
        .fn()
        .mockImplementation((args: { where: { id: string } }) =>
          Promise.resolve(
            Object.values(options.batchesBySku ?? { [sku]: defaultBatches })
              .flat()
              .find((candidate) => candidate.id === args.where.id) ?? null,
          ),
        ),
      findMany: jest
        .fn()
        .mockImplementation((args: { where: { item: { sku: string } } }) =>
          Promise.resolve(options.batchesBySku?.[args.where.item.sku] ?? defaultBatches),
        ),
    },
    auditLog: { create: jest.fn().mockResolvedValue({ id: "audit-1" }) },
  };
  const prisma = {
    $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
  };
  const adjustment = {
    reconcileInTx: jest
      .fn()
      .mockImplementation(
        async (_tx: unknown, _userId: string, batchId: string, countedQty: number) => ({
          batchId,
          countedQty,
          applied: true,
        }),
      ),
    recalculateWarehousesAfterCommit: jest.fn().mockResolvedValue(undefined),
  };
  const service = new ReportService(prisma as never, adjustment as never);
  return { service, prisma, tx, adjustment };
}

function batch(id: string, quantity: number, loans: ReturnType<typeof loan>[] = []) {
  return {
    id,
    itemId: "item-1",
    shelfId: "shelf-1",
    batchCode: id,
    quantity,
    status: "AVAILABLE",
    condition: "NEW",
    circulation: "IN_STOCK",
    expiryDate: null,
    inspectedAt: null,
    createdAt: new Date(id === "batch-a" ? "2026-01-01" : "2026-02-01"),
    loans,
  };
}

function loan(quantity: number) {
  return {
    id: `loan-${quantity}`,
    batchId: "unused",
    quantity,
    borrowedByUserId: null,
    missionId: null,
    status: LoanStatus.ON_LOAN,
    returnedOk: 0,
    returnedDamaged: 0,
    lost: 0,
    borrowedAt: new Date("2026-01-01"),
    closedAt: null,
  };
}

function reconcileTargets(state: ReturnType<typeof makeState>) {
  return state.adjustment.reconcileInTx.mock.calls.map((call) => ({
    batchId: call[2] as string,
    countedQty: call[3] as number,
  }));
}
