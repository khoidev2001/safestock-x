import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { AppModule } from "../src/app.module";
import { InventoryService } from "../src/inventory/inventory.service";
import { transferInventoryInTx } from "../src/inventory/inventory-transfer";
import { PrismaService } from "../src/prisma/prisma.service";

describe("Inventory transfer atomic (E2E PostgreSQL)", () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let inventory: InventoryService;
  let actorId: string;
  let warehouseId: string;
  let peerWarehouseId: string;
  let peerZoneId: string;
  let peerShelfId: string;
  let foreignOrganizationId: string;
  let foreignWarehouseId: string;
  let foreignZoneId: string;
  let itemId: string;
  let sourceShelfId: string;
  let destinationShelfIds: string[];
  let foreignShelfId: string;
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const prefix = `E2E-XFER-${runId}`;
  let baseline: { batches: number; transactions: number; audits: number };

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    prisma = moduleRef.get(PrismaService);
    await prisma.$connect();
    inventory = new InventoryService(prisma, {
      recalculateWarehouse: jest.fn().mockResolvedValue(undefined),
    } as never);

    const actor = await prisma.user.findUniqueOrThrow({
      where: { email: "staff@ungphonhanh.life" },
    });
    actorId = actor.id;
    warehouseId = actor.warehouseId as string;
    const sourceWarehouse = await prisma.warehouse.findUniqueOrThrow({
      where: { id: warehouseId },
    });

    const localShelves = await prisma.shelf.findMany({
      where: { zone: { warehouseId } },
      select: { id: true },
      take: 3,
    });
    if (localShelves.length < 3) throw new Error("E2E transfer cần ít nhất 3 kệ trong kho actor");
    [sourceShelfId, ...destinationShelfIds] = localShelves.map((shelf) => shelf.id);

    const peerWarehouse = await prisma.warehouse.create({
      data: {
        organizationId: actor.organizationId,
        name: `${prefix}-peer`,
        communeId: sourceWarehouse.communeId,
      },
    });
    peerWarehouseId = peerWarehouse.id;
    const peerZone = await prisma.warehouseZone.create({
      data: { warehouseId: peerWarehouseId, code: `${prefix}-P`, name: `${prefix}-peer-zone` },
    });
    peerZoneId = peerZone.id;
    peerShelfId = (
      await prisma.shelf.create({ data: { zoneId: peerZoneId, code: `${prefix}-P1` } })
    ).id;

    const foreignOrganization = await prisma.organization.create({
      data: { name: `${prefix}-foreign-org` },
    });
    foreignOrganizationId = foreignOrganization.id;
    const foreignWarehouse = await prisma.warehouse.create({
      data: {
        organizationId: foreignOrganizationId,
        name: `${prefix}-foreign`,
        communeId: `${prefix}-foreign-commune`,
      },
    });
    foreignWarehouseId = foreignWarehouse.id;
    const foreignZone = await prisma.warehouseZone.create({
      data: {
        warehouseId: foreignWarehouseId,
        code: `${prefix}-F`,
        name: `${prefix}-foreign-zone`,
      },
    });
    foreignZoneId = foreignZone.id;
    foreignShelfId = (
      await prisma.shelf.create({ data: { zoneId: foreignZoneId, code: `${prefix}-F1` } })
    ).id;
    itemId = (await prisma.item.findFirstOrThrow({ select: { id: true } })).id;
    baseline = await fixtureCounts();
  });

  afterEach(async () => {
    await cleanupFixtures();
  });

  afterAll(async () => {
    await cleanupFixtures();
    expect(await fixtureCounts()).toEqual(baseline);
    await prisma.$transaction([
      prisma.shelf.deleteMany({ where: { id: { in: [peerShelfId, foreignShelfId] } } }),
      prisma.warehouseZone.deleteMany({ where: { id: { in: [peerZoneId, foreignZoneId] } } }),
      prisma.warehouse.deleteMany({ where: { id: { in: [peerWarehouseId, foreignWarehouseId] } } }),
      prisma.organization.deleteMany({ where: { id: foreignOrganizationId } }),
    ]);
    await prisma.$disconnect();
    await moduleRef.close();
  });

  it("partial transfer tách child và bảo toàn tổng quantity", async () => {
    const note = `${prefix}-partial`;
    const source = await createBatch("partial", 10, sourceShelfId);

    const result = await inventory.transfer(
      actorId,
      source.id,
      destinationShelfIds[0],
      4,
      note,
      warehouseId,
    );

    const rows = await fixtureBatches();
    const sourceAfter = rows.find((batch) => batch.id === source.id);
    const child = rows.find((batch) => batch.id === result.batch?.id);
    expect(sourceAfter).toEqual(expect.objectContaining({ shelfId: sourceShelfId, quantity: 6 }));
    expect(child).toEqual(
      expect.objectContaining({ shelfId: destinationShelfIds[0], quantity: 4, itemId }),
    );
    expect(rows.reduce((sum, batch) => sum + batch.quantity, 0)).toBe(10);
    expect(result.transaction.batchId).toBe(child?.id);

    const audit = await auditFor(note);
    expect(audit?.metadata).toEqual(
      expect.objectContaining({
        sourceBatchId: source.id,
        destinationBatchId: child?.id,
        fromShelfId: sourceShelfId,
        toShelfId: destinationShelfIds[0],
        split: true,
      }),
    );
  });

  it("full transfer giữ batch ID và không tạo child", async () => {
    const source = await createBatch("full", 10, sourceShelfId);
    const result = await inventory.transfer(
      actorId,
      source.id,
      destinationShelfIds[0],
      10,
      `${prefix}-full`,
      warehouseId,
    );

    expect(result.batch).toEqual(
      expect.objectContaining({ id: source.id, shelfId: destinationShelfIds[0], quantity: 10 }),
    );
    expect(await fixtureBatches()).toHaveLength(1);
  });

  it("chặn IDOR ở cả source và destination", async () => {
    const localSource = await createBatch("scope-local", 10, sourceShelfId);
    await expect(
      inventory.transfer(
        actorId,
        localSource.id,
        foreignShelfId,
        4,
        `${prefix}-scope-dest`,
        warehouseId,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    const foreignSource = await createBatch("scope-foreign", 10, foreignShelfId);
    await expect(
      inventory.transfer(
        actorId,
        foreignSource.id,
        destinationShelfIds[0],
        4,
        `${prefix}-scope-source`,
        warehouseId,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(
      (await prisma.itemBatch.findUniqueOrThrow({ where: { id: localSource.id } })).quantity,
    ).toBe(10);
    expect(
      (await prisma.itemBatch.findUniqueOrThrow({ where: { id: foreignSource.id } })).quantity,
    ).toBe(10);
  });

  it("vượt tồn và same-shelf không tạo ledger", async () => {
    const source = await createBatch("invalid", 10, sourceShelfId);
    await expect(
      inventory.transfer(
        actorId,
        source.id,
        destinationShelfIds[0],
        11,
        `${prefix}-over`,
        warehouseId,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      inventory.transfer(actorId, source.id, sourceShelfId, 4, `${prefix}-same`, warehouseId),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(
      await prisma.inventoryTransaction.count({ where: { note: { startsWith: prefix } } }),
    ).toBe(0);
  });

  it("concurrent partial không over-transfer hoặc double-ledger", async () => {
    const source = await createBatch("concurrent-partial", 10, sourceShelfId);
    const note = `${prefix}-concurrent-partial`;

    const settled = await Promise.allSettled([
      inventory.transfer(actorId, source.id, destinationShelfIds[0], 6, note, warehouseId),
      inventory.transfer(actorId, source.id, destinationShelfIds[1], 6, note, warehouseId),
    ]);

    expect(settled.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(settled.filter((result) => result.status === "rejected")).toHaveLength(1);
    const batches = await fixtureBatches();
    expect(batches.reduce((sum, batch) => sum + batch.quantity, 0)).toBe(10);
    expect(batches.every((batch) => batch.quantity >= 0)).toBe(true);
    expect(batches.map((batch) => batch.quantity).sort((a, b) => a - b)).toEqual([4, 6]);
    expect(await prisma.inventoryTransaction.count({ where: { note } })).toBe(1);
    expect(await auditsFor(note)).toHaveLength(1);
  });

  it("hai partial hợp lệ cùng thành công và audit dùng quantity sau lock", async () => {
    const source = await createBatch("concurrent-valid", 10, sourceShelfId);
    const note = `${prefix}-concurrent-valid`;

    const results = await Promise.all([
      inventory.transfer(actorId, source.id, destinationShelfIds[0], 4, note, warehouseId),
      inventory.transfer(actorId, source.id, destinationShelfIds[1], 4, note, warehouseId),
    ]);

    expect(results).toHaveLength(2);
    expect((await fixtureBatches()).reduce((sum, batch) => sum + batch.quantity, 0)).toBe(10);
    expect(await prisma.inventoryTransaction.count({ where: { note } })).toBe(2);
    const audits = await auditsFor(note);
    expect(audits).toHaveLength(2);
    const transitions = audits
      .map((audit) => {
        const metadata = audit.metadata as {
          before: { sourceQuantity: number };
          after: { sourceQuantity: number };
        };
        return [metadata.before.sourceQuantity, metadata.after.sourceQuantity];
      })
      .sort((left, right) => left[0] - right[0]);
    expect(transitions).toEqual([
      [6, 2],
      [10, 6],
    ]);
    expect(transitions.every(([before, after]) => before - after === 4)).toBe(true);
  });

  it("concurrent partial 6 + 4 bảo toàn tồn và cho phép source về 0", async () => {
    const source = await createBatch("concurrent-complement", 10, sourceShelfId);
    const note = `${prefix}-concurrent-complement`;

    const results = await Promise.all([
      inventory.transfer(actorId, source.id, destinationShelfIds[0], 6, note, warehouseId),
      inventory.transfer(actorId, source.id, destinationShelfIds[1], 4, note, warehouseId),
    ]);

    expect(results).toHaveLength(2);
    const batches = await fixtureBatches();
    expect(batches.reduce((sum, batch) => sum + batch.quantity, 0)).toBe(10);
    expect(batches.every((batch) => batch.quantity >= 0)).toBe(true);
    // Lần chuyển sau vét nốt phần còn lại nên là chuyển TOÀN BỘ: hệ thống dời
    // chính lô đó sang kệ mới thay vì tách rồi để lại một lô rỗng làm rác sổ sách.
    expect(batches.map((batch) => batch.quantity).sort((a, b) => a - b)).toEqual([4, 6]);
    expect(await prisma.inventoryTransaction.count({ where: { note } })).toBe(2);
    expect(await auditsFor(note)).toHaveLength(2);
  });

  it("hai lệnh chuyển toàn bộ đồng thời không nhân đôi và không mất hàng", async () => {
    // Hai lệnh cùng dời trọn một lô đi hai nơi. Row lock xếp chúng nối đuôi nhau
    // nên lệnh sau đọc được vị trí mới và dời tiếp — không phải double-spend.
    // Điều phải giữ bằng mọi giá là: lô chỉ nằm ở MỘT kệ, số lượng không đổi, và
    // mỗi lần commit ghi đúng một dòng sổ.
    const source = await createBatch("concurrent-full", 10, sourceShelfId);
    const note = `${prefix}-concurrent-full`;

    const settled = await Promise.allSettled([
      inventory.transfer(actorId, source.id, destinationShelfIds[0], 10, note, warehouseId),
      inventory.transfer(actorId, source.id, destinationShelfIds[1], 10, note, warehouseId),
    ]);

    const committed = settled.filter((result) => result.status === "fulfilled").length;
    expect(committed).toBeGreaterThanOrEqual(1);
    const after = await prisma.itemBatch.findUniqueOrThrow({ where: { id: source.id } });
    expect(destinationShelfIds).toContain(after.shelfId);
    expect(after.quantity).toBe(10);
    const batches = await fixtureBatches();
    expect(batches.reduce((sum, batch) => sum + batch.quantity, 0)).toBe(10);
    // Không có lô con nào bị sinh ra: chuyển toàn bộ là dời chỗ, không phải tách.
    expect(batches).toHaveLength(1);
    expect(await prisma.inventoryTransaction.count({ where: { note } })).toBe(committed);
    expect(await auditsFor(note)).toHaveLength(committed);
  });

  it("chuyển toàn bộ và chuyển một phần chạy cùng lúc vẫn bảo toàn tồn", async () => {
    // Lệnh nào chạm lô trước sẽ quyết định lệnh sau còn làm được gì. Bất biến
    // không đổi: tổng vẫn là 10, không lô nào âm, và sổ sách khớp số lần commit.
    const source = await createBatch("concurrent-mixed", 10, sourceShelfId);
    const note = `${prefix}-concurrent-mixed`;

    const settled = await Promise.allSettled([
      inventory.transfer(actorId, source.id, destinationShelfIds[0], 10, note, warehouseId),
      inventory.transfer(actorId, source.id, destinationShelfIds[1], 4, note, warehouseId),
    ]);

    const committed = settled.filter((result) => result.status === "fulfilled").length;
    expect(committed).toBeGreaterThanOrEqual(1);
    const batches = await fixtureBatches();
    expect(batches.reduce((sum, batch) => sum + batch.quantity, 0)).toBe(10);
    expect(batches.every((batch) => batch.quantity >= 0)).toBe(true);
    expect(await prisma.inventoryTransaction.count({ where: { note } })).toBe(committed);
    expect(await auditsFor(note)).toHaveLength(committed);
  });

  it("batch còn loan mở bị chặn trước khi tách", async () => {
    const source = await createBatch("open-loan", 10, sourceShelfId);
    await prisma.loanRecord.create({
      data: { batchId: source.id, quantity: 2, borrowedByUserId: actorId },
    });

    await expect(
      inventory.transfer(
        actorId,
        source.id,
        destinationShelfIds[0],
        4,
        `${prefix}-open-loan`,
        warehouseId,
      ),
    ).rejects.toBeDefined();
    expect((await prisma.itemBatch.findUniqueOrThrow({ where: { id: source.id } })).quantity).toBe(
      10,
    );
  });

  it("caller transaction failure rollback source, child, ledger và audit", async () => {
    const source = await createBatch("rollback", 10, sourceShelfId);
    const note = `${prefix}-rollback`;

    await expect(
      prisma.$transaction(async (tx) => {
        await transferInventoryInTx(tx, {
          userId: actorId,
          batchId: source.id,
          toShelfId: destinationShelfIds[0],
          quantity: 4,
          note,
          scopeWarehouseId: warehouseId,
        });
        throw new Error("force rollback after transfer");
      }),
    ).rejects.toThrow("force rollback after transfer");

    expect(await fixtureBatches()).toEqual([
      expect.objectContaining({ id: source.id, shelfId: sourceShelfId, quantity: 10 }),
    ]);
    expect(await prisma.inventoryTransaction.count({ where: { note } })).toBe(0);
    expect(await auditsFor(note)).toHaveLength(0);
  });

  it("scope null chỉ được chuyển liên kho trong cùng organization/xã", async () => {
    const source = await createBatch("admin-cross", 10, sourceShelfId);
    const result = await inventory.transfer(
      actorId,
      source.id,
      peerShelfId,
      10,
      `${prefix}-admin-cross`,
      null,
    );

    expect(result.batch).toEqual(expect.objectContaining({ id: source.id, shelfId: peerShelfId }));
    expect(peerWarehouseId).not.toBe(warehouseId);
  });

  it("scope null vẫn chặn destination thuộc organization/xã khác", async () => {
    const source = await createBatch("admin-foreign", 10, sourceShelfId);

    await expect(
      inventory.transfer(actorId, source.id, foreignShelfId, 10, `${prefix}-admin-foreign`, null),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect((await prisma.itemBatch.findUniqueOrThrow({ where: { id: source.id } })).shelfId).toBe(
      sourceShelfId,
    );
  });

  async function createBatch(label: string, quantity: number, shelfId: string) {
    return prisma.itemBatch.create({
      data: {
        itemId,
        shelfId,
        batchCode: `${prefix}-${label}`,
        quantity,
      },
    });
  }

  async function fixtureBatches() {
    return prisma.itemBatch.findMany({
      where: { batchCode: { startsWith: prefix } },
      orderBy: { createdAt: "asc" },
    });
  }

  async function auditFor(note: string) {
    return (await auditsFor(note))[0];
  }

  async function auditsFor(note: string) {
    const rows = await prisma.auditLog.findMany({
      where: { action: "INVENTORY_TRANSFER", actorId },
      orderBy: { createdAt: "desc" },
    });
    return rows.filter((row) => (row.metadata as { note?: string } | null)?.note === note);
  }

  async function fixtureCounts() {
    const audits = await prisma.auditLog.findMany({
      where: { action: "INVENTORY_TRANSFER", actorId },
      select: { metadata: true },
    });
    return {
      batches: await prisma.itemBatch.count({ where: { batchCode: { startsWith: prefix } } }),
      transactions: await prisma.inventoryTransaction.count({
        where: { note: { startsWith: prefix } },
      }),
      audits: audits.filter((row) =>
        (row.metadata as { note?: string } | null)?.note?.startsWith(prefix),
      ).length,
    };
  }

  async function cleanupFixtures() {
    const batches = await fixtureBatches();
    const batchIds = batches.map((batch) => batch.id);
    const auditIds = (
      await prisma.auditLog.findMany({
        where: { action: "INVENTORY_TRANSFER", actorId },
        select: { id: true, metadata: true },
      })
    )
      .filter((row) => (row.metadata as { note?: string } | null)?.note?.startsWith(prefix))
      .map((row) => row.id);

    await prisma.$transaction([
      prisma.loanRecord.deleteMany({ where: { batchId: { in: batchIds } } }),
      prisma.inventoryTransaction.deleteMany({
        where: {
          OR: [
            { note: { startsWith: prefix } },
            ...(batchIds.length > 0 ? [{ batchId: { in: batchIds } }] : []),
          ],
        },
      }),
      prisma.auditLog.deleteMany({ where: { id: { in: auditIds } } }),
      prisma.itemBatch.deleteMany({ where: { id: { in: batchIds } } }),
    ]);
  }
});
