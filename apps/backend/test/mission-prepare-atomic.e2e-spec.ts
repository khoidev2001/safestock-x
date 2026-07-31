import { INestApplication, ValidationPipe } from "@nestjs/common";
import { MissionStatus, Prisma } from "@prisma/client";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { InventoryService } from "../src/inventory/inventory.service";
import { PrismaService } from "../src/prisma/prisma.service";
import { ReadinessService } from "../src/readiness/readiness.service";

interface Fixture {
  missionId: string;
  allocations: { batchId: string; quantity: number }[];
  actorId: string;
  originalQuantities: Map<string, number>;
}

describe("Mission prepare atomic (E2E PostgreSQL)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let inventory: InventoryService;
  let readiness: ReadinessService;
  let http: ReturnType<typeof request>;
  let token: string;
  let adminToken: string;
  let rescueToken: string;
  let actorId: string;
  let warehouseId: string;
  let centralBatches: { id: string; quantity: number }[];
  let foreignBatch: { id: string; quantity: number };
  let foreignWarehouseId: string;
  let fixtureBatchIds: string[];
  const fixtures: Fixture[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api");
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);
    inventory = app.get(InventoryService);
    readiness = app.get(ReadinessService);
    http = request(app.getHttpServer());

    const login = await http
      .post("/api/auth/login")
      .send({ email: "staff@ungphonhanh.life", password: "staff123" })
      .expect(201);
    token = login.body.accessToken as string;
    adminToken = (
      await http.post("/api/auth/login").send({ email: "admin", password: "admin123@" }).expect(201)
    ).body.accessToken as string;
    rescueToken = (
      await http
        .post("/api/auth/login")
        .send({ email: "rescue@ungphonhanh.life", password: "rescue123" })
        .expect(201)
    ).body.accessToken as string;
    const actor = await prisma.user.findUniqueOrThrow({
      where: { email: "staff@ungphonhanh.life" },
    });
    actorId = actor.id;
    warehouseId = actor.warehouseId as string;

    const centralTemplate = await prisma.itemBatch.findFirstOrThrow({
      where: { shelf: { zone: { warehouseId } } },
      select: { itemId: true, shelfId: true },
    });
    const foreignTemplate = await prisma.itemBatch.findFirstOrThrow({
      where: { shelf: { zone: { warehouseId: { not: warehouseId } } } },
      select: {
        itemId: true,
        shelfId: true,
        shelf: { select: { zone: { select: { warehouseId: true } } } },
      },
    });
    foreignWarehouseId = foreignTemplate.shelf?.zone.warehouseId as string;
    const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const fixtureBatches = await prisma.$transaction((tx) =>
      Promise.all([
        tx.itemBatch.create({
          data: {
            itemId: centralTemplate.itemId,
            shelfId: centralTemplate.shelfId,
            batchCode: `E2E-PREP-C1-${runId}`,
            quantity: 50,
          },
        }),
        tx.itemBatch.create({
          data: {
            itemId: centralTemplate.itemId,
            shelfId: centralTemplate.shelfId,
            batchCode: `E2E-PREP-C2-${runId}`,
            quantity: 50,
          },
        }),
        tx.itemBatch.create({
          data: {
            itemId: foreignTemplate.itemId,
            shelfId: foreignTemplate.shelfId,
            batchCode: `E2E-PREP-F1-${runId}`,
            quantity: 50,
          },
        }),
      ]),
    );
    centralBatches = fixtureBatches.slice(0, 2).map((batch) => ({
      id: batch.id,
      quantity: batch.quantity,
    }));
    foreignBatch = {
      id: fixtureBatches[2].id,
      quantity: fixtureBatches[2].quantity,
    };
    fixtureBatchIds = fixtureBatches.map((batch) => batch.id);
  });

  afterAll(async () => {
    await prisma.$transaction(async (tx) => {
      await tx.inventoryTransaction.deleteMany({ where: { batchId: { in: fixtureBatchIds } } });
      await tx.auditLog.deleteMany({ where: { entityId: { in: fixtureBatchIds } } });
      await tx.itemBatch.deleteMany({ where: { id: { in: fixtureBatchIds } } });
    });
    await Promise.all([
      readiness.recalculateWarehouse(warehouseId),
      readiness.recalculateWarehouse(foreignWarehouseId),
    ]);
    await app.close();
  });

  afterEach(async () => {
    while (fixtures.length > 0) {
      const fixture = fixtures.pop() as Fixture;
      await cleanupFixture(fixture);
    }
  });

  const auth = () => ({ Authorization: `Bearer ${token}` });

  async function createFixture(
    allocations: { batchId: string; quantity: number }[],
    missionWarehouseId = warehouseId,
    status: MissionStatus = MissionStatus.PENDING_WAREHOUSE,
  ): Promise<Fixture> {
    const allocated = allocations.reduce((sum, item) => sum + item.quantity, 0);
    const originalQuantities = await quantitiesOf(allocations);
    const mission = await prisma.mission.create({
      data: {
        warehouseId: missionWarehouseId,
        incidentType: "FLOOD",
        affectedPeople: 1,
        durationHours: 1,
        priority: "MEDIUM",
        parsedInput: {},
        status,
        fulfillment: 100,
        requirements: {
          create: {
            sku: `E2E-${Date.now()}`,
            itemName: "Vật tư E2E atomic prepare",
            required: allocated,
            allocated,
            shortage: 0,
            unit: "đơn vị",
            allocations: allocations.map((item) => ({
              batchId: item.batchId,
              qty: item.quantity,
            })) as unknown as Prisma.InputJsonValue,
          },
        },
      },
    });
    const fixture = { missionId: mission.id, allocations, actorId, originalQuantities };
    fixtures.push(fixture);
    return fixture;
  }

  async function cleanupFixture(fixture: Fixture) {
    await prisma.$transaction(async (tx) => {
      for (const [batchId, quantity] of fixture.originalQuantities) {
        await tx.itemBatch.update({
          where: { id: batchId },
          data: { quantity },
        });
      }
      await tx.notification.deleteMany({ where: { missionId: fixture.missionId } });
      const notes = [
        `Nhiệm vụ ${fixture.missionId}`,
        `Hoàn kho: nhiệm vụ ${fixture.missionId} giao thất bại`,
      ];
      await tx.inventoryTransaction.deleteMany({ where: { note: { in: notes } } });
      await tx.auditLog.deleteMany({
        where: {
          OR: notes.map((note) => ({ metadata: { path: ["note"], equals: note } })),
        },
      });
      await tx.mission.deleteMany({ where: { id: fixture.missionId } });
    });
    if (fixture.allocations.length > 0) {
      await inventory.recalcBatches(fixture.allocations.map((item) => item.batchId));
    }
  }

  it("rollback toàn bộ khi batch sau thiếu tồn", async () => {
    const allocations = [
      { batchId: centralBatches[0].id, quantity: 1 },
      { batchId: centralBatches[1].id, quantity: centralBatches[1].quantity + 1 },
    ];
    const fixture = await createFixture(allocations);
    const before = await quantitiesOf(allocations);

    await http.post(`/api/missions/${fixture.missionId}/prepare`).set(auth()).expect(400);

    expect(await quantitiesOf(allocations)).toEqual(before);
    await expectStatus(fixture.missionId, MissionStatus.PENDING_WAREHOUSE);
    expect(await transactionCount(fixture.missionId)).toBe(0);
    expect(await auditCount(fixture)).toBe(0);
  });

  it("hai request đồng thời và retry chỉ xuất, audit, notify một lần", async () => {
    const allocations = centralBatches.map((batch) => ({ batchId: batch.id, quantity: 1 }));
    const fixture = await createFixture(allocations);
    const before = await quantitiesOf(allocations);

    const responses = await Promise.all([
      http.post(`/api/missions/${fixture.missionId}/prepare`).set(auth()),
      http.post(`/api/missions/${fixture.missionId}/prepare`).set(auth()),
    ]);
    expect(responses.map((response) => response.status)).toEqual([201, 201]);
    await http.post(`/api/missions/${fixture.missionId}/prepare`).set(auth()).expect(201);

    const after = await quantitiesOf(allocations);
    for (const item of allocations) {
      expect(after.get(item.batchId)).toBe((before.get(item.batchId) as number) - item.quantity);
    }
    expect(await transactionCount(fixture.missionId)).toBe(allocations.length);
    expect(await auditCount(fixture)).toBe(allocations.length);
    expect(
      await prisma.notification.count({
        where: { missionId: fixture.missionId, kind: "WAREHOUSE_READY" },
      }),
    ).toBe(2);
  });

  it("batch ngoài scope trả 403 và không đổi mission/tồn kho", async () => {
    const allocations = [{ batchId: foreignBatch.id, quantity: 1 }];
    const fixture = await createFixture(allocations);
    const before = await quantitiesOf(allocations);

    await http.post(`/api/missions/${fixture.missionId}/prepare`).set(auth()).expect(403);

    expect(await quantitiesOf(allocations)).toEqual(before);
    await expectStatus(fixture.missionId, MissionStatus.PENDING_WAREHOUSE);
    expect(await transactionCount(fixture.missionId)).toBe(0);
  });

  it("mission không có allocation vẫn READY và không tạo transaction", async () => {
    const fixture = await createFixture([]);

    await http.post(`/api/missions/${fixture.missionId}/prepare`).set(auth()).expect(201);

    await expectStatus(fixture.missionId, MissionStatus.READY);
    expect(await transactionCount(fixture.missionId)).toBe(0);
  });

  it("mission kho khác bị chặn cả khi không allocation hoặc đã READY", async () => {
    const pending = await createFixture([], foreignWarehouseId);
    await http.post(`/api/missions/${pending.missionId}/prepare`).set(auth()).expect(403);
    await expectStatus(pending.missionId, MissionStatus.PENDING_WAREHOUSE);

    const ready = await createFixture([], foreignWarehouseId);
    await prisma.mission.update({
      where: { id: ready.missionId },
      data: { status: MissionStatus.READY },
    });
    await http.post(`/api/missions/${ready.missionId}/prepare`).set(auth()).expect(403);
    await expectStatus(ready.missionId, MissionStatus.READY);
  });

  it("prepare chạy đồng thời cancel không thể để stock đã trừ nhưng mission bị huỷ", async () => {
    const allocations = [{ batchId: centralBatches[0].id, quantity: 1 }];
    const fixture = await createFixture(allocations);
    const responses = await Promise.all([
      http.post(`/api/missions/${fixture.missionId}/prepare`).set(auth()),
      http
        .post(`/api/missions/${fixture.missionId}/cancel`)
        .set({ Authorization: `Bearer ${adminToken}` })
        .send({ note: "Kiểm thử race prepare/cancel" }),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([201, 400]);
    const mission = await prisma.mission.findUniqueOrThrow({ where: { id: fixture.missionId } });
    const after = await quantitiesOf(allocations);
    if (mission.status === MissionStatus.READY) {
      expect(after.get(allocations[0].batchId)).toBe(
        (fixture.originalQuantities.get(allocations[0].batchId) as number) - 1,
      );
      expect(await transactionCount(fixture.missionId)).toBe(1);
    } else {
      expect(mission.status).toBe(MissionStatus.CANCELLED);
      expect(after).toEqual(fixture.originalQuantities);
      expect(await transactionCount(fixture.missionId)).toBe(0);
    }
  });

  it("hai complete FAILED đồng thời chỉ hoàn kho một lần", async () => {
    const allocations = [{ batchId: centralBatches[0].id, quantity: 1 }];
    const fixture = await createFixture(allocations);
    await http.post(`/api/missions/${fixture.missionId}/prepare`).set(auth()).expect(201);

    const responses = await Promise.all([
      http
        .post(`/api/missions/${fixture.missionId}/complete`)
        .set({ Authorization: `Bearer ${rescueToken}` })
        .send({ outcome: "FAILED" }),
      http
        .post(`/api/missions/${fixture.missionId}/complete`)
        .set({ Authorization: `Bearer ${rescueToken}` })
        .send({ outcome: "FAILED" }),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([201, 400]);
    await expectStatus(fixture.missionId, MissionStatus.COMPLETED);
    expect(await quantitiesOf(allocations)).toEqual(fixture.originalQuantities);
    expect(
      await prisma.inventoryTransaction.count({
        where: {
          note: `Hoàn kho: nhiệm vụ ${fixture.missionId} giao thất bại`,
          type: "IMPORT",
        },
      }),
    ).toBe(1);
  });

  it("approve chạy đồng thời cancel không thể hồi sinh mission đã huỷ", async () => {
    const fixture = await createFixture([], warehouseId, MissionStatus.DRAFT);
    const responses = await Promise.all([
      http
        .post(`/api/missions/${fixture.missionId}/approve`)
        .set({ Authorization: `Bearer ${adminToken}` }),
      http
        .post(`/api/missions/${fixture.missionId}/cancel`)
        .set({ Authorization: `Bearer ${adminToken}` })
        .send({ note: "Kiểm thử race approve/cancel" }),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([201, 400]);
    const mission = await prisma.mission.findUniqueOrThrow({ where: { id: fixture.missionId } });
    expect([MissionStatus.APPROVED, MissionStatus.CANCELLED]).toContain(mission.status);
  });

  async function quantitiesOf(items: { batchId: string }[]) {
    const rows = await prisma.itemBatch.findMany({
      where: { id: { in: items.map((item) => item.batchId) } },
      select: { id: true, quantity: true },
    });
    return new Map(rows.map((row) => [row.id, row.quantity]));
  }

  async function expectStatus(missionId: string, status: MissionStatus) {
    const mission = await prisma.mission.findUniqueOrThrow({ where: { id: missionId } });
    expect(mission.status).toBe(status);
  }

  function transactionCount(missionId: string) {
    return prisma.inventoryTransaction.count({ where: { note: `Nhiệm vụ ${missionId}` } });
  }

  function auditCount(fixture: Fixture) {
    return prisma.auditLog.count({
      where: {
        actorId: fixture.actorId,
        action: "INVENTORY_EXPORT",
        metadata: { path: ["note"], equals: `Nhiệm vụ ${fixture.missionId}` },
      },
    });
  }
});
