import { Test, TestingModule } from "@nestjs/testing";
import { AppModule } from "../src/app.module";
import { InterCommuneLoanService } from "../src/loan/inter-commune-loan.service";
import { PrismaService } from "../src/prisma/prisma.service";

/**
 * Nhận hàng mượn liên xã khi kho CHƯA TỪNG có mặt hàng đó.
 *
 * Chạy trên Postgres thật, đi qua đúng `advance` như nút "Xác nhận đã nhận hàng".
 * Dựng hẳn một đơn vị riêng để chắc chắn đơn vị này không có lô nào của mã vật tư.
 */
describe("Inter-commune loan receive without existing batch (E2E PostgreSQL)", () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let service: InterCommuneLoanService;
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const prefix = `E2E-LOANRCV-${runId}`;
  const freshSku = `${prefix}-SKU`;
  const freshUnit = `${prefix}-unit`;
  let organizationId: string;
  let warehouseId: string;
  let zoneId: string;
  let shelfId: string;
  let userId: string;
  let existingSku: string;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    prisma = moduleRef.get(PrismaService);
    service = moduleRef.get(InterCommuneLoanService);
    await prisma.$connect();

    organizationId = (await prisma.organization.create({ data: { name: `${prefix}-org` } })).id;
    warehouseId = (
      await prisma.warehouse.create({
        data: { organizationId, name: `${prefix}-central`, kind: "CENTRAL", communeId: prefix },
      })
    ).id;
    zoneId = (
      await prisma.warehouseZone.create({ data: { warehouseId, code: "A", name: `${prefix}-zone` } })
    ).id;
    // Kệ khoá xếp trước kệ mở theo mã: phải bỏ qua nó.
    await prisma.shelf.create({ data: { zoneId, code: "A0", isLocked: true } });
    shelfId = (await prisma.shelf.create({ data: { zoneId, code: "A1" } })).id;
    userId = (
      await prisma.user.create({
        data: {
          organizationId,
          email: `${prefix}@e2e.local`,
          passwordHash: "x",
          fullName: prefix,
          role: "ADMIN",
        },
      })
    ).id;
    existingSku = (await prisma.item.findFirstOrThrow({ select: { sku: true } })).sku;
  });

  afterAll(async () => {
    const batches = await prisma.itemBatch.findMany({
      where: { shelf: { zone: { warehouseId } } },
      select: { id: true },
    });
    const batchIds = batches.map((b) => b.id);
    await prisma.$transaction([
      prisma.inventoryTransaction.deleteMany({ where: { batchId: { in: batchIds } } }),
      prisma.itemBatch.deleteMany({ where: { id: { in: batchIds } } }),
      prisma.interCommuneLoan.deleteMany({ where: { organizationId } }),
      prisma.auditLog.deleteMany({ where: { actorId: userId } }),
      prisma.notification.deleteMany({ where: { organizationId } }),
      prisma.item.deleteMany({ where: { sku: freshSku } }),
      prisma.itemCategory.deleteMany({ where: { unit: freshUnit } }),
      prisma.shelf.deleteMany({ where: { zoneId } }),
      prisma.warehouseZone.deleteMany({ where: { id: zoneId } }),
      prisma.userSession.deleteMany({ where: { userId } }),
      prisma.user.deleteMany({ where: { id: userId } }),
      prisma.warehouse.deleteMany({ where: { id: warehouseId } }),
      prisma.organization.deleteMany({ where: { id: organizationId } }),
    ]);
    await prisma.$disconnect();
    await moduleRef.close();
  });

  const approvedIncomingLoan = (sku: string, itemName: string, unit: string, quantity: number) =>
    prisma.interCommuneLoan.create({
      data: {
        organizationId,
        direction: "INCOMING",
        status: "APPROVED",
        peerCommuneName: "Xuân Thọ",
        itemSku: sku,
        itemName,
        unit,
        quantity,
      },
    });

  it("opens a batch on an unlocked shelf of the central warehouse for a known item", async () => {
    const loan = await approvedIncomingLoan(existingSku, "known", "chiếc", 3);

    const updated = await service.advance({ loanId: loan.id, userId, to: "ACTIVE" });

    expect(updated?.status).toBe("ACTIVE");
    const batch = await prisma.itemBatch.findFirstOrThrow({
      where: { batchCode: `LOAN-${loan.id}` },
      include: { item: true },
    });
    expect(batch.item.sku).toBe(existingSku);
    expect(batch.shelfId).toBe(shelfId);
    expect(batch.quantity).toBe(3);
    const txns = await prisma.inventoryTransaction.findMany({ where: { batchId: batch.id } });
    expect(txns).toHaveLength(1);
    expect(txns[0]).toMatchObject({ type: "IMPORT", quantityDelta: 3, afterQuantity: 3 });
  });

  it("declares the item from the loan's name and unit when the catalog lacks the sku", async () => {
    const loan = await approvedIncomingLoan(freshSku, "Loa thử nghiệm", freshUnit, 2);

    await service.advance({ loanId: loan.id, userId, to: "ACTIVE" });

    const item = await prisma.item.findUniqueOrThrow({
      where: { sku: freshSku },
      include: { category: true, batches: true },
    });
    expect(item.name).toBe("Loa thử nghiệm");
    expect(item.category.unit).toBe(freshUnit);
    expect(item.batches.map((b) => [b.batchCode, b.quantity])).toEqual([[`LOAN-${loan.id}`, 2]]);
  });
});
