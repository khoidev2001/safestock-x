import { ConflictException, ForbiddenException } from "@nestjs/common";
import { Prisma, ReportStatus, UserRole } from "@prisma/client";
import { InventoryAdjustmentService } from "../src/inventory/inventory-adjustment.service";
import { InventoryService } from "../src/inventory/inventory.service";
import { LoanService } from "../src/loan/loan.service";
import { PrismaService } from "../src/prisma/prisma.service";
import { ReportService } from "../src/report/report.service";

describe("Report approve atomic (E2E PostgreSQL)", () => {
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const prefix = `E2E-RPT-${runId}`;
  let prisma: PrismaService;
  let adjustment: InventoryAdjustmentService;
  let inventory: InventoryService;
  let reports: ReportService;
  let loans: LoanService;
  let readiness: { recalculateWarehouse: jest.Mock };
  let organizationId: string;
  let foreignOrganizationId: string;
  let warehouseId: string;
  let zoneId: string;
  let shelfId: string;
  let actorId: string;
  let foreignActorId: string;
  let submitterId: string;
  let categoryId: string;
  let itemId: string;
  let sku: string;
  let baseline: FixtureCounts;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    readiness = { recalculateWarehouse: jest.fn().mockResolvedValue(undefined) };
    adjustment = new InventoryAdjustmentService(prisma, readiness as never);
    inventory = new InventoryService(prisma, readiness as never);
    reports = new ReportService(prisma, adjustment);
    loans = new LoanService(prisma, readiness as never);

    const organization = await prisma.organization.create({ data: { name: `${prefix}-org` } });
    organizationId = organization.id;
    const foreignOrganization = await prisma.organization.create({
      data: { name: `${prefix}-foreign-org` },
    });
    foreignOrganizationId = foreignOrganization.id;
    const warehouse = await prisma.warehouse.create({
      data: {
        organizationId,
        communeId: `${prefix}-commune`,
        name: `${prefix}-warehouse`,
      },
    });
    warehouseId = warehouse.id;
    const zone = await prisma.warehouseZone.create({
      data: { warehouseId, code: `${prefix}-Z`, name: `${prefix}-zone` },
    });
    zoneId = zone.id;
    shelfId = (await prisma.shelf.create({ data: { zoneId, code: `${prefix}-S` } })).id;

    const [actor, foreignActor, submitter] = await Promise.all([
      prisma.user.create({
        data: {
          organizationId,
          email: `${prefix}-admin@example.test`,
          passwordHash: "unused",
          fullName: `${prefix} admin`,
          role: UserRole.ADMIN,
        },
      }),
      prisma.user.create({
        data: {
          organizationId: foreignOrganizationId,
          email: `${prefix}-foreign-admin@example.test`,
          passwordHash: "unused",
          fullName: `${prefix} foreign admin`,
          role: UserRole.ADMIN,
        },
      }),
      prisma.user.create({
        data: {
          organizationId,
          warehouseId,
          email: `${prefix}-submitter@example.test`,
          passwordHash: "unused",
          fullName: `${prefix} submitter`,
          role: UserRole.WAREHOUSE,
        },
      }),
    ]);
    actorId = actor.id;
    foreignActorId = foreignActor.id;
    submitterId = submitter.id;

    categoryId = (
      await prisma.itemCategory.create({
        data: { name: `${prefix}-category`, unit: "unit" },
      })
    ).id;
    sku = `${prefix}-SKU`;
    itemId = (
      await prisma.item.create({
        data: { categoryId, name: `${prefix}-item`, sku },
      })
    ).id;
    baseline = await fixtureCounts();
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    readiness.recalculateWarehouse.mockReset().mockResolvedValue(undefined);
    await cleanupFixtures();
    expect(await fixtureCounts()).toEqual(baseline);
  });

  afterAll(async () => {
    await cleanupFixtures();
    expect(await fixtureCounts()).toEqual(baseline);
    await prisma.$transaction([
      prisma.user.deleteMany({ where: { id: { in: [actorId, foreignActorId, submitterId] } } }),
      prisma.shelf.deleteMany({ where: { id: shelfId } }),
      prisma.warehouseZone.deleteMany({ where: { id: zoneId } }),
      prisma.item.deleteMany({ where: { id: itemId } }),
      prisma.itemCategory.deleteMany({ where: { id: categoryId } }),
      prisma.warehouse.deleteMany({ where: { id: warehouseId } }),
      prisma.organization.deleteMany({
        where: { id: { in: [organizationId, foreignOrganizationId] } },
      }),
    ]);
    await prisma.$disconnect();
  });

  it("ghi đúng một lần kiểm đếm cho từng lô đã khai báo", async () => {
    const fixture = await createFixture();

    const result = await reports.approve(fixture.reportId, actorId);

    expect(result).toEqual({
      id: fixture.reportId,
      status: ReportStatus.APPROVED,
      applied: [
        { sku, batchId: fixture.batchIds[0], countedQty: 5 },
        { sku, batchId: fixture.batchIds[1], countedQty: 4 },
      ],
    });
    expect(await batchQuantities(fixture.batchIds)).toEqual([5, 4]);
    expect(await countedQuantities(fixture.batchIds)).toEqual([5, 4]);
    expect(await auditCount("REPORT_APPROVE", [fixture.reportId])).toBe(1);
    expect(await auditCount("INVENTORY_RECONCILE", fixture.batchIds)).toBe(1);
    expect(readiness.recalculateWarehouse).toHaveBeenCalledTimes(1);
    expect(readiness.recalculateWarehouse).toHaveBeenCalledWith(warehouseId);
  });

  it("rolls back the claim, prior reconciles, counts and audits when a later batch fails", async () => {
    const fixture = await createFixture();
    const original = adjustment.reconcileInTx.bind(adjustment);
    let calls = 0;
    jest.spyOn(adjustment, "reconcileInTx").mockImplementation(async (...args) => {
      const result = await original(...args);
      calls += 1;
      if (calls === 2) throw new Error("forced failure after second reconcile");
      return result;
    });

    await expect(reports.approve(fixture.reportId, actorId)).rejects.toThrow(
      "forced failure after second reconcile",
    );

    expect(await reportStatus(fixture.reportId)).toBe(ReportStatus.PENDING);
    expect(await batchQuantities(fixture.batchIds)).toEqual([5, 7]);
    expect(await countedQuantities(fixture.batchIds)).toEqual([]);
    expect(await auditCount("REPORT_APPROVE", [fixture.reportId])).toBe(0);
    expect(await auditCount("INVENTORY_RECONCILE", fixture.batchIds)).toBe(0);
    expect(readiness.recalculateWarehouse).not.toHaveBeenCalled();
  });

  it("concurrent approve plus retry creates one mutation set", async () => {
    const fixture = await createFixture();

    const concurrent = await Promise.allSettled([
      reports.approve(fixture.reportId, actorId),
      reports.approve(fixture.reportId, actorId),
    ]);
    expect(concurrent.every((result) => result.status === "fulfilled")).toBe(true);
    const fulfilled = concurrent.map((result) =>
      result.status === "fulfilled" ? result.value : undefined,
    );
    expect(fulfilled.map((result) => result?.applied.length).sort()).toEqual([0, 2]);

    await expect(reports.approve(fixture.reportId, actorId)).resolves.toEqual({
      id: fixture.reportId,
      status: ReportStatus.APPROVED,
      applied: [],
    });
    expect(await batchQuantities(fixture.batchIds)).toEqual([5, 4]);
    expect(await countedQuantities(fixture.batchIds)).toEqual([5, 4]);
    expect(await auditCount("REPORT_APPROVE", [fixture.reportId])).toBe(1);
    expect(await auditCount("INVENTORY_RECONCILE", fixture.batchIds)).toBe(1);
    expect(readiness.recalculateWarehouse).toHaveBeenCalledTimes(1);
  });

  it("holds loan borrow writes until approval commits", async () => {
    const fixture = await createFixture();
    const gate = pauseFirstReconcile();

    const approval = reports.approve(fixture.reportId, actorId);
    await gate.entered;
    const borrowing = loans.borrow(actorId, fixture.batchIds[0], 2);

    await expectPending(borrowing);
    gate.release();
    await expect(Promise.all([approval, borrowing])).resolves.toHaveLength(2);

    expect(await batchQuantities(fixture.batchIds)).toEqual([5, 4]);
    expect(await openLoanQuantity(fixture.batchIds[0])).toBe(2);
  });

  it("waits for a borrow snapshot captured before approval starts", async () => {
    const fixture = await createFixture([0, 0]);
    const gate = pauseLoanCreate();
    const borrowing = gate.service.borrow(actorId, fixture.batchIds[0], 4);
    await gate.entered;
    const approval = reports.approve(fixture.reportId, actorId);

    try {
      await expectPending(approval);
    } finally {
      gate.release();
    }
    await expect(Promise.all([borrowing, approval])).resolves.toHaveLength(2);

    expect(await batchQuantities(fixture.batchIds)).toEqual([4, 0]);
    expect(await openLoanQuantity(fixture.batchIds[0])).toBe(4);
  });

  it("holds partial-return writes until approval commits", async () => {
    const fixture = await createFixture();
    const loan = await prisma.loanRecord.create({
      data: { batchId: fixture.batchIds[0], quantity: 2, borrowedByUserId: actorId },
    });
    await prisma.itemBatch.update({
      where: { id: fixture.batchIds[0] },
      data: { circulation: "ON_LOAN" },
    });
    const gate = pauseFirstReconcile();

    const approval = reports.approve(fixture.reportId, actorId);
    await gate.entered;
    const returning = loans.returnItems(actorId, loan.id, 1, 0, 0);

    await expectPending(returning);
    gate.release();
    await expect(Promise.all([approval, returning])).resolves.toHaveLength(2);

    // Lô A: đếm được 5 trên kệ, cộng 2 đang cho mượn vẫn thuộc kho = 7. Người đi
    // đếm không thấy hàng đang ở ngoài, nên hệ thống không được coi đó là mất.
    // Trả 1 cái tốt chỉ giảm số đang mượn, không đổi tồn vật lý.
    expect(await batchQuantities(fixture.batchIds)).toEqual([7, 4]);
    expect(await openLoanQuantity(fixture.batchIds[0])).toBe(1);
  });

  it("rolls approval back when inventory changes after allocation", async () => {
    const fixture = await createFixture();
    const gate = pauseFirstReconcile();
    const approval = reports.approve(fixture.reportId, actorId);
    await gate.entered;

    try {
      await inventory.export(actorId, fixture.batchIds[0], 1, `${prefix}-concurrent-export`);
    } finally {
      gate.release();
    }
    await expect(approval).rejects.toBeInstanceOf(ConflictException);

    expect(await reportStatus(fixture.reportId)).toBe(ReportStatus.PENDING);
    expect(await batchQuantities(fixture.batchIds)).toEqual([4, 7]);
    expect(await countedQuantities(fixture.batchIds)).toEqual([]);
    expect(await auditCount("REPORT_APPROVE", [fixture.reportId])).toBe(0);
  });

  it("approve and reject race has exactly one coherent terminal winner", async () => {
    const fixture = await createFixture([3, 0]);

    const outcomes = await Promise.allSettled([
      reports.approve(fixture.reportId, actorId),
      reports.reject(fixture.reportId, actorId, `${prefix}-race-reject`),
    ]);
    expect(outcomes.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((result) => result.status === "rejected")).toHaveLength(1);

    const status = await reportStatus(fixture.reportId);
    if (status === ReportStatus.APPROVED) {
      expect(await batchQuantities(fixture.batchIds)).toEqual([3, 0]);
      expect(await countedQuantities(fixture.batchIds)).toEqual([3, 0]);
      expect(await auditCount("REPORT_APPROVE", [fixture.reportId])).toBe(1);
    } else {
      expect(status).toBe(ReportStatus.REJECTED);
      expect(await batchQuantities(fixture.batchIds)).toEqual([5, 7]);
      expect(await countedQuantities(fixture.batchIds)).toEqual([]);
      expect(await auditCount("REPORT_APPROVE", [fixture.reportId])).toBe(0);
    }
  });

  it("blocks an approving actor from another organization without writes", async () => {
    const fixture = await createFixture();

    await expect(reports.approve(fixture.reportId, foreignActorId)).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    expect(await reportStatus(fixture.reportId)).toBe(ReportStatus.PENDING);
    expect(await batchQuantities(fixture.batchIds)).toEqual([5, 7]);
    expect(await countedQuantities(fixture.batchIds)).toEqual([]);
    expect(await auditCount("REPORT_APPROVE", [fixture.reportId])).toBe(0);
    expect(readiness.recalculateWarehouse).not.toHaveBeenCalled();
  });

  /**
   * Báo cáo kiểm đếm ghi rõ đếm được bao nhiêu ở TỪNG LÔ.
   *
   * Khi một mã vật tư nằm ở nhiều lô, hệ thống không tự đoán số đếm thuộc lô
   * nào: người đi đếm phải ghi rõ. Đoán hộ ở đây nghĩa là đoán hộ hạn dùng và
   * tình trạng của hàng cứu trợ.
   */
  async function createFixture(countedPerBatch: [number, number] = [5, 4]) {
    const batches = await prisma.$transaction([
      prisma.itemBatch.create({
        data: {
          itemId,
          shelfId,
          batchCode: `${prefix}-${Math.random().toString(36).slice(2)}-A`,
          quantity: 5,
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
        },
      }),
      prisma.itemBatch.create({
        data: {
          itemId,
          shelfId,
          batchCode: `${prefix}-${Math.random().toString(36).slice(2)}-B`,
          quantity: 7,
          createdAt: new Date("2026-02-01T00:00:00.000Z"),
        },
      }),
    ]);
    const report = await prisma.monthlyStockReport.create({
      data: {
        warehouseId,
        submittedByUserId: submitterId,
        period: "2026-07",
        rows: batches.map((batch, index) => ({
          sku,
          itemName: `${prefix}-item`,
          quantity: countedPerBatch[index] ?? 0,
          unit: "unit",
          batchId: batch.id,
          batchCode: batch.batchCode,
        })) as unknown as Prisma.InputJsonValue,
      },
    });
    return { reportId: report.id, batchIds: batches.map((batch) => batch.id) };
  }

  async function batchQuantities(batchIds: string[]) {
    const batches = await prisma.itemBatch.findMany({
      where: { id: { in: batchIds } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { quantity: true },
    });
    return batches.map((batch) => batch.quantity);
  }

  async function countedQuantities(batchIds: string[]) {
    const counts = await prisma.inventoryCount.findMany({
      where: { batchId: { in: batchIds } },
      orderBy: { countedAt: "asc" },
      select: { countedQty: true },
    });
    return counts.map((count) => count.countedQty);
  }

  async function reportStatus(reportId: string) {
    return (
      await prisma.monthlyStockReport.findUniqueOrThrow({
        where: { id: reportId },
        select: { status: true },
      })
    ).status;
  }

  function auditCount(action: string, entityIds: string[]) {
    return prisma.auditLog.count({
      where: { action, actorId, entityId: { in: entityIds } },
    });
  }

  function openLoanQuantity(batchId: string) {
    return prisma.loanRecord
      .findMany({ where: { batchId, status: { not: "CLOSED" } } })
      .then((records) =>
        records.reduce(
          (total, record) =>
            total + record.quantity - record.returnedOk - record.returnedDamaged - record.lost,
          0,
        ),
      );
  }

  function pauseFirstReconcile() {
    let release!: () => void;
    let entered!: () => void;
    const enteredPromise = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const releasePromise = new Promise<void>((resolve) => {
      release = resolve;
    });
    const original = adjustment.reconcileInTx.bind(adjustment);
    let paused = false;
    jest.spyOn(adjustment, "reconcileInTx").mockImplementation(async (...args) => {
      if (!paused) {
        paused = true;
        entered();
        await releasePromise;
      }
      return original(...args);
    });
    return { entered: enteredPromise, release };
  }

  function pauseLoanCreate() {
    let release!: () => void;
    let entered!: () => void;
    const enteredPromise = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const releasePromise = new Promise<void>((resolve) => {
      release = resolve;
    });
    const wrappedPrisma = {
      // recalcAfterLoanTxn (gap C) tra kho chủ của lô sau commit → cần itemBatch thật.
      itemBatch: prisma.itemBatch,
      $transaction: (callback: (client: Prisma.TransactionClient) => Promise<unknown>) =>
        prisma.$transaction((tx) => {
          const loanRecord = new Proxy(tx.loanRecord, {
            get(target, property, receiver) {
              if (property !== "create") return Reflect.get(target, property, receiver);
              return async (...args: Parameters<typeof target.create>) => {
                entered();
                await releasePromise;
                return target.create(...args);
              };
            },
          });
          const client = new Proxy(tx, {
            get(target, property, receiver) {
              if (property === "loanRecord") return loanRecord;
              const value = Reflect.get(target, property, receiver);
              return typeof value === "function" ? value.bind(target) : value;
            },
          });
          return callback(client as Prisma.TransactionClient);
        }),
    };
    return {
      service: new LoanService(wrappedPrisma as never, readiness as never),
      entered: enteredPromise,
      release,
    };
  }

  async function fixtureCounts(): Promise<FixtureCounts> {
    const batches = await prisma.itemBatch.findMany({
      where: { batchCode: { startsWith: prefix } },
      select: { id: true },
    });
    const reportsForWarehouse = await prisma.monthlyStockReport.findMany({
      where: { warehouseId },
      select: { id: true },
    });
    const batchIds = batches.map((batch) => batch.id);
    const reportIds = reportsForWarehouse.map((report) => report.id);
    const loanIds = (
      await prisma.loanRecord.findMany({
        where: { batchId: { in: batchIds } },
        select: { id: true },
      })
    ).map((loan) => loan.id);
    return {
      batches: batchIds.length,
      reports: reportIds.length,
      counts: await prisma.inventoryCount.count({ where: { batchId: { in: batchIds } } }),
      loans: await prisma.loanRecord.count({ where: { batchId: { in: batchIds } } }),
      transactions: await prisma.inventoryTransaction.count({
        where: { batchId: { in: batchIds } },
      }),
      audits: await prisma.auditLog.count({
        where: { entityId: { in: [...batchIds, ...reportIds, ...loanIds] } },
      }),
    };
  }

  async function cleanupFixtures() {
    const batches = await prisma.itemBatch.findMany({
      where: { batchCode: { startsWith: prefix } },
      select: { id: true },
    });
    const reportsForWarehouse = await prisma.monthlyStockReport.findMany({
      where: { warehouseId },
      select: { id: true },
    });
    const batchIds = batches.map((batch) => batch.id);
    const reportIds = reportsForWarehouse.map((report) => report.id);
    const loanIds = (
      await prisma.loanRecord.findMany({
        where: { batchId: { in: batchIds } },
        select: { id: true },
      })
    ).map((loan) => loan.id);
    await prisma.$transaction([
      prisma.auditLog.deleteMany({
        where: { entityId: { in: [...batchIds, ...reportIds, ...loanIds] } },
      }),
      prisma.inventoryCount.deleteMany({ where: { batchId: { in: batchIds } } }),
      prisma.inventoryTransaction.deleteMany({ where: { batchId: { in: batchIds } } }),
      prisma.loanRecord.deleteMany({ where: { batchId: { in: batchIds } } }),
      prisma.monthlyStockReport.deleteMany({ where: { id: { in: reportIds } } }),
      prisma.itemBatch.deleteMany({ where: { id: { in: batchIds } } }),
    ]);
  }
});

interface FixtureCounts {
  batches: number;
  reports: number;
  counts: number;
  loans: number;
  transactions: number;
  audits: number;
}

async function expectPending(promise: Promise<unknown>) {
  const state = await Promise.race([
    promise.then(
      () => "settled",
      () => "settled",
    ),
    new Promise<"pending">((resolve) => setTimeout(() => resolve("pending"), 150)),
  ]);
  expect(state).toBe("pending");
}
