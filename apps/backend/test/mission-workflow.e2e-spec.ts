import { INestApplication, ValidationPipe } from "@nestjs/common";
import { MissionStatus, Prisma, UserRole, WarehouseKind } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import { Test } from "@nestjs/testing";
import * as bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";

type TokenRole = "admin" | "rescue" | "warehouse" | "warehouseB";

interface SuiteFixture {
  organizationId: string;
  warehouseId: string;
  warehouseBId: string;
  zoneId: string;
  zoneBId: string;
  shelfId: string;
  shelfBId: string;
  categoryId: string;
  itemId: string;
  itemSku: string;
  itemName: string;
  userIds: string[];
  emails: Record<TokenRole, string>;
}

interface MissionFixture {
  missionId: string;
  batchId: string;
  initialQuantity: number;
  allocatedQuantity: number;
}

interface MultiWarehouseMissionFixture {
  missionId: string;
  batchAId: string;
  batchBId: string;
  allocationA: number;
  allocationB: number;
}

/** E2E liên role qua HTTP/JWT/PostgreSQL với toàn bộ dữ liệu thuộc riêng suite. */
describe("Mission workflow (E2E)", () => {
  let app: INestApplication | undefined;
  let prisma: PrismaService | undefined;
  let http: ReturnType<typeof request>;
  let suiteFixture: SuiteFixture | undefined;
  let tokens: Record<TokenRole, string>;

  const missionIds = new Set<string>();
  const batchIds = new Set<string>();
  const initialBatchQuantity = 40;
  const allocatedQuantity = 7;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api");
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    const db = app.get(PrismaService);
    prisma = db;
    http = request(app.getHttpServer());

    const runId = `${Date.now()}-${randomUUID()}`;
    const password = `${randomUUID()}-${randomUUID()}`;
    const passwordHash = await bcrypt.hash(password, 10);
    const emails: Record<TokenRole, string> = {
      admin: `e2e-workflow-admin-${runId}@example.test`,
      rescue: `e2e-workflow-rescue-${runId}@example.test`,
      warehouse: `e2e-workflow-warehouse-${runId}@example.test`,
      warehouseB: `e2e-workflow-warehouse-b-${runId}@example.test`,
    };

    const createdFixture = await db.$transaction(async (tx) => {
      const organization = await tx.organization.create({
        data: { name: `E2E mission workflow ${runId}` },
      });
      const warehouse = await tx.warehouse.create({
        data: {
          organizationId: organization.id,
          name: `Kho E2E mission workflow ${runId}`,
          kind: WarehouseKind.CENTRAL,
          communeId: `e2e-workflow-${runId}`,
        },
      });
      const warehouseB = await tx.warehouse.create({
        data: {
          organizationId: organization.id,
          name: `Kho B E2E mission workflow ${runId}`,
          kind: WarehouseKind.HAMLET,
          communeId: `e2e-workflow-${runId}`,
        },
      });
      const zone = await tx.warehouseZone.create({
        data: {
          warehouseId: warehouse.id,
          code: `WF-${runId}`,
          name: "Khu E2E mission workflow",
        },
      });
      const zoneB = await tx.warehouseZone.create({
        data: {
          warehouseId: warehouseB.id,
          code: `WF-B-${runId}`,
          name: "Khu B E2E mission workflow",
        },
      });
      const shelf = await tx.shelf.create({
        data: { zoneId: zone.id, code: `WF-${runId}` },
      });
      const shelfB = await tx.shelf.create({
        data: { zoneId: zoneB.id, code: `WF-B-${runId}` },
      });
      const category = await tx.itemCategory.create({
        data: { name: `Danh mục E2E mission workflow ${runId}`, unit: "gói" },
      });
      const item = await tx.item.create({
        data: {
          categoryId: category.id,
          name: "Vật tư tiêu hao E2E mission workflow",
          sku: `E2E-WORKFLOW-${runId}`,
          consumable: true,
        },
      });
      const users = await Promise.all([
        tx.user.create({
          data: {
            organizationId: organization.id,
            email: emails.admin,
            passwordHash,
            fullName: "Admin E2E mission workflow",
            role: UserRole.ADMIN,
          },
        }),
        tx.user.create({
          data: {
            organizationId: organization.id,
            email: emails.rescue,
            passwordHash,
            fullName: "Cứu hộ E2E mission workflow",
            role: UserRole.RESCUE,
          },
        }),
        tx.user.create({
          data: {
            organizationId: organization.id,
            email: emails.warehouse,
            passwordHash,
            fullName: "Nhân viên kho E2E mission workflow",
            role: UserRole.WAREHOUSE,
            warehouseId: warehouse.id,
          },
        }),
        tx.user.create({
          data: {
            organizationId: organization.id,
            email: emails.warehouseB,
            passwordHash,
            fullName: "Nhân viên kho B E2E mission workflow",
            role: UserRole.WAREHOUSE,
            warehouseId: warehouseB.id,
          },
        }),
      ]);

      return {
        organizationId: organization.id,
        warehouseId: warehouse.id,
        warehouseBId: warehouseB.id,
        zoneId: zone.id,
        zoneBId: zoneB.id,
        shelfId: shelf.id,
        shelfBId: shelfB.id,
        categoryId: category.id,
        itemId: item.id,
        itemSku: item.sku,
        itemName: item.name,
        userIds: users.map((user) => user.id),
        emails,
      };
    });

    suiteFixture = createdFixture;
    const owned = createdFixture;
    tokens = {
      admin: await login(owned.emails.admin, password),
      rescue: await login(owned.emails.rescue, password),
      warehouse: await login(owned.emails.warehouse, password),
      warehouseB: await login(owned.emails.warehouseB, password),
    };
  });

  afterEach(async () => {
    if (prisma && suiteFixture) await cleanupOwnedRuntimeData(prisma, suiteFixture);
  });

  afterAll(async () => {
    const cleanupErrors: unknown[] = [];
    if (prisma && suiteFixture) {
      try {
        await cleanupOwnedRuntimeData(prisma, suiteFixture);
      } catch (error) {
        cleanupErrors.push(error);
      }
      try {
        await cleanupSuiteFixture(prisma, suiteFixture);
      } catch (error) {
        cleanupErrors.push(error);
        try {
          await cleanupSuiteFixtureBestEffort(prisma, suiteFixture);
        } catch (fallbackError) {
          cleanupErrors.push(fallbackError);
        }
      }
    }
    if (app) {
      try {
        await app.close();
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    if (cleanupErrors.length > 0) {
      throw new AggregateError(cleanupErrors, "Không thể dọn sạch fixture mission workflow");
    }
  });

  function database(): PrismaService {
    if (!prisma) throw new Error("Prisma chưa được khởi tạo");
    return prisma;
  }

  function fixture(): SuiteFixture {
    if (!suiteFixture) throw new Error("Fixture suite chưa được khởi tạo");
    return suiteFixture;
  }

  async function login(email: string, password: string): Promise<string> {
    const response = await http.post("/api/auth/login").send({ email, password }).expect(201);
    const accessToken = response.body.accessToken as unknown;
    if (typeof accessToken !== "string" || accessToken.length === 0) {
      throw new Error("Đăng nhập fixture không trả access token hợp lệ");
    }
    return accessToken;
  }

  function auth(role: TokenRole) {
    return { Authorization: `Bearer ${tokens[role]}` };
  }

  async function createMissionFixture(): Promise<MissionFixture> {
    const db = database();
    const owned = fixture();
    const uniqueId = `${Date.now()}-${randomUUID()}`;
    const batch = await db.itemBatch.create({
      data: {
        itemId: owned.itemId,
        shelfId: owned.shelfId,
        batchCode: `E2E-WORKFLOW-${uniqueId}`,
        quantity: initialBatchQuantity,
      },
    });
    batchIds.add(batch.id);

    const mission = await db.mission.create({
      data: {
        warehouseId: owned.warehouseId,
        incidentType: "FLOOD",
        affectedPeople: 20,
        durationHours: 24,
        priority: "MEDIUM",
        parsedInput: {
          incidentType: "FLOOD",
          affectedPeople: 20,
          durationHours: 24,
          children: 2,
          elderly: 2,
          medicalSupportCases: 0,
        },
        status: MissionStatus.DRAFT,
        fulfillment: 100,
        readinessAssessment: {
          status: "READY",
          fulfillment: 100,
          items: [
            {
              sku: owned.itemSku,
              itemName: owned.itemName,
              required: allocatedQuantity,
              allocated: allocatedQuantity,
              shortage: 0,
              fulfillment: 100,
              status: "READY",
            },
          ],
          blockers: [],
          recommendedActions: [],
        } as Prisma.InputJsonValue,
        requirements: {
          create: {
            sku: owned.itemSku,
            itemName: owned.itemName,
            required: allocatedQuantity,
            allocated: allocatedQuantity,
            shortage: 0,
            unit: "gói",
            allocations: [{ batchId: batch.id, qty: allocatedQuantity }] as Prisma.InputJsonValue,
          },
        },
      },
    });
    missionIds.add(mission.id);

    return {
      missionId: mission.id,
      batchId: batch.id,
      initialQuantity: initialBatchQuantity,
      allocatedQuantity,
    };
  }

  async function createMultiWarehouseMissionFixture(): Promise<MultiWarehouseMissionFixture> {
    const db = database();
    const owned = fixture();
    const uniqueId = `${Date.now()}-${randomUUID()}`;
    const allocationA = 4;
    const allocationB = 6;
    const [batchA, batchB] = await db.$transaction([
      db.itemBatch.create({
        data: {
          itemId: owned.itemId,
          shelfId: owned.shelfId,
          batchCode: `E2E-WORKFLOW-MULTI-A-${uniqueId}`,
          quantity: initialBatchQuantity,
        },
      }),
      db.itemBatch.create({
        data: {
          itemId: owned.itemId,
          shelfId: owned.shelfBId,
          batchCode: `E2E-WORKFLOW-MULTI-B-${uniqueId}`,
          quantity: initialBatchQuantity,
        },
      }),
    ]);
    batchIds.add(batchA.id);
    batchIds.add(batchB.id);

    const mission = await db.mission.create({
      data: {
        warehouseId: owned.warehouseId,
        incidentType: "FLOOD",
        affectedPeople: 20,
        durationHours: 24,
        priority: "MEDIUM",
        parsedInput: {
          incidentType: "FLOOD",
          affectedPeople: 20,
          durationHours: 24,
          children: 2,
          elderly: 2,
          medicalSupportCases: 0,
        },
        status: MissionStatus.DRAFT,
        fulfillment: 100,
        readinessAssessment: {
          status: "READY",
          fulfillment: 100,
          items: [],
          blockers: [],
          recommendedActions: [],
        } as Prisma.InputJsonValue,
        requirements: {
          create: {
            sku: owned.itemSku,
            itemName: owned.itemName,
            required: allocationA + allocationB,
            allocated: allocationA + allocationB,
            shortage: 0,
            unit: "gói",
            allocations: [
              {
                batchId: batchA.id,
                qty: allocationA,
                warehouseId: owned.warehouseId,
                warehouseName: "Kho A",
              },
              {
                batchId: batchB.id,
                qty: allocationB,
                warehouseId: owned.warehouseBId,
                warehouseName: "Kho B",
              },
            ] as Prisma.InputJsonValue,
          },
        },
      },
    });
    missionIds.add(mission.id);

    return {
      missionId: mission.id,
      batchAId: batchA.id,
      batchBId: batchB.id,
      allocationA,
      allocationB,
    };
  }

  async function dispatchAndConfirm(missionId: string): Promise<void> {
    await http.post(`/api/missions/${missionId}/dispatch`).set(auth("admin")).expect(201);
    await http.post(`/api/missions/${missionId}/confirm`).set(auth("rescue")).expect(201);
  }

  async function createReadyMission(): Promise<MissionFixture> {
    const owned = await createMissionFixture();
    await dispatchAndConfirm(owned.missionId);
    await http.post(`/api/missions/${owned.missionId}/prepare`).set(auth("warehouse")).expect(201);
    return owned;
  }

  async function stockOfBatch(batchId: string): Promise<number> {
    const batch = await database().itemBatch.findUniqueOrThrow({ where: { id: batchId } });
    return batch.quantity;
  }

  async function cleanupOwnedRuntimeData(db: PrismaClient, owned: SuiteFixture): Promise<void> {
    const ownedMissionIds = [...missionIds];
    const ownedBatchIds = [...batchIds];
    const notes = ownedMissionIds.flatMap((missionId) => [
      `Nhiệm vụ ${missionId}`,
      `Hoàn kho: nhiệm vụ ${missionId} giao thất bại`,
    ]);

    await db.$transaction(async (tx) => {
      await tx.notification.deleteMany({
        where: {
          OR: [
            ...(ownedMissionIds.length > 0 ? [{ missionId: { in: ownedMissionIds } }] : []),
            { warehouseId: owned.warehouseId },
            { warehouseId: owned.warehouseBId },
          ],
        },
      });
      if (ownedBatchIds.length > 0) {
        await tx.inventoryTransaction.deleteMany({ where: { batchId: { in: ownedBatchIds } } });
        await tx.inventoryCount.deleteMany({ where: { batchId: { in: ownedBatchIds } } });
        await tx.loanRecord.deleteMany({ where: { batchId: { in: ownedBatchIds } } });
      }
      if (ownedBatchIds.length > 0 || notes.length > 0) {
        await tx.auditLog.deleteMany({
          where: {
            actorId: { in: owned.userIds },
            OR: [
              ...(ownedBatchIds.length > 0 ? [{ entityId: { in: ownedBatchIds } }] : []),
              ...notes.map((note) => ({ metadata: { path: ["note"], equals: note } })),
            ],
          },
        });
      }
      await tx.readinessScore.deleteMany({ where: { warehouseId: owned.warehouseId } });
      await tx.readinessScore.deleteMany({ where: { warehouseId: owned.warehouseBId } });
      if (ownedMissionIds.length > 0) {
        await tx.mission.deleteMany({ where: { id: { in: ownedMissionIds } } });
      }
      if (ownedBatchIds.length > 0) {
        await tx.itemBatch.deleteMany({ where: { id: { in: ownedBatchIds } } });
      }
    });
  }

  async function cleanupSuiteFixture(db: PrismaClient, owned: SuiteFixture): Promise<void> {
    await db.$transaction(async (tx) => {
      await deleteSuiteFixtureInOrder(tx, owned);
    });
  }

  async function cleanupSuiteFixtureBestEffort(
    db: PrismaClient,
    owned: SuiteFixture,
  ): Promise<void> {
    const cleanupErrors: unknown[] = [];
    for (const cleanup of suiteFixtureCleanupSteps(db, owned)) {
      try {
        await cleanup();
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    if (cleanupErrors.length > 0) {
      throw new AggregateError(cleanupErrors, "Không thể dọn hết bản ghi fixture suite");
    }
  }

  async function deleteSuiteFixtureInOrder(
    tx: Prisma.TransactionClient,
    owned: SuiteFixture,
  ): Promise<void> {
    for (const cleanup of suiteFixtureCleanupSteps(tx, owned)) await cleanup();
  }

  function suiteFixtureCleanupSteps(
    db: PrismaClient | Prisma.TransactionClient,
    owned: SuiteFixture,
  ): Array<() => Promise<unknown>> {
    return [
      () => db.user.deleteMany({ where: { id: { in: owned.userIds } } }),
      () => db.shelf.deleteMany({ where: { id: owned.shelfId } }),
      () => db.shelf.deleteMany({ where: { id: owned.shelfBId } }),
      () => db.warehouseZone.deleteMany({ where: { id: owned.zoneId } }),
      () => db.warehouseZone.deleteMany({ where: { id: owned.zoneBId } }),
      () => db.item.deleteMany({ where: { id: owned.itemId } }),
      () => db.itemCategory.deleteMany({ where: { id: owned.categoryId } }),
      () => db.warehouse.deleteMany({ where: { id: owned.warehouseId } }),
      () => db.warehouse.deleteMany({ where: { id: owned.warehouseBId } }),
      () => db.organization.deleteMany({ where: { id: owned.organizationId } }),
    ];
  }

  describe("Happy path liên role (giao đủ)", () => {
    it("prepare TRỪ tồn kho đúng phần đã cấp", async () => {
      const owned = await createMissionFixture();
      const before = await stockOfBatch(owned.batchId);

      await dispatchAndConfirm(owned.missionId);
      await http
        .post(`/api/missions/${owned.missionId}/prepare`)
        .set(auth("warehouse"))
        .expect(201);

      expect(await stockOfBatch(owned.batchId)).toBe(before - owned.allocatedQuantity);
    });

    it("mission đa kho chỉ xuất phần từng kho, retry-safe và READY sau kho cuối", async () => {
      const owned = await createMultiWarehouseMissionFixture();
      await dispatchAndConfirm(owned.missionId);

      const visibleToWarehouseB = await http
        .get(`/api/missions/${owned.missionId}`)
        .set(auth("warehouseB"))
        .expect(200);
      expect(visibleToWarehouseB.body.warehousePreparations).toHaveLength(2);

      const afterWarehouseA = await http
        .post(`/api/missions/${owned.missionId}/prepare`)
        .set(auth("warehouse"))
        .expect(201);
      expect(afterWarehouseA.body.status).toBe("PENDING_WAREHOUSE");
      expect(await stockOfBatch(owned.batchAId)).toBe(
        initialBatchQuantity - owned.allocationA,
      );
      expect(await stockOfBatch(owned.batchBId)).toBe(initialBatchQuantity);

      await http
        .post(`/api/missions/${owned.missionId}/prepare`)
        .set(auth("warehouse"))
        .expect(201);
      expect(await stockOfBatch(owned.batchAId)).toBe(
        initialBatchQuantity - owned.allocationA,
      );

      const afterWarehouseB = await http
        .post(`/api/missions/${owned.missionId}/prepare`)
        .set(auth("warehouseB"))
        .expect(201);
      expect(afterWarehouseB.body.status).toBe("READY");
      expect(await stockOfBatch(owned.batchBId)).toBe(
        initialBatchQuantity - owned.allocationB,
      );

      await http
        .post(`/api/missions/${owned.missionId}/prepare`)
        .set(auth("warehouseB"))
        .expect(201);
      expect(await stockOfBatch(owned.batchBId)).toBe(
        initialBatchQuantity - owned.allocationB,
      );

      const exports = await database().inventoryTransaction.count({
        where: {
          batchId: { in: [owned.batchAId, owned.batchBId] },
          type: "EXPORT",
          note: `Nhiệm vụ ${owned.missionId}`,
        },
      });
      expect(exports).toBe(2);
    });

    it("hai kho prepare đồng thời vẫn có đúng một lần chuyển READY", async () => {
      const owned = await createMultiWarehouseMissionFixture();
      await dispatchAndConfirm(owned.missionId);

      const [warehouseAResponse, warehouseBResponse] = await Promise.all([
        http
          .post(`/api/missions/${owned.missionId}/prepare`)
          .set(auth("warehouse"))
          .expect(201),
        http
          .post(`/api/missions/${owned.missionId}/prepare`)
          .set(auth("warehouseB"))
          .expect(201),
      ]);

      expect(
        [warehouseAResponse.body.status, warehouseBResponse.body.status].sort(),
      ).toEqual(["PENDING_WAREHOUSE", "READY"].sort());
      expect(
        (await database().mission.findUniqueOrThrow({
          where: { id: owned.missionId },
        })).status,
      ).toBe(MissionStatus.READY);
      expect(await stockOfBatch(owned.batchAId)).toBe(
        initialBatchQuantity - owned.allocationA,
      );
      expect(await stockOfBatch(owned.batchBId)).toBe(
        initialBatchQuantity - owned.allocationB,
      );
      expect(
        await database().inventoryTransaction.count({
          where: {
            batchId: { in: [owned.batchAId, owned.batchBId] },
            type: "EXPORT",
            note: `Nhiệm vụ ${owned.missionId}`,
          },
        }),
      ).toBe(2);
    });

    it("complete DELIVERED → COMPLETED, tồn kho GIỮ NGUYÊN (đã giao hết)", async () => {
      const owned = await createReadyMission();
      const before = await stockOfBatch(owned.batchId);

      const response = await http
        .post(`/api/missions/${owned.missionId}/complete`)
        .set(auth("rescue"))
        .send({ outcome: "DELIVERED", note: "Giao đủ tại điểm tập kết xã" })
        .expect(201);

      expect(response.body.status).toBe("COMPLETED");
      expect(response.body.deliveryOutcome).toBe("DELIVERED");
      expect(response.body.completedAt).toBeTruthy();
      expect(await stockOfBatch(owned.batchId)).toBe(before);
    });
  });

  describe("Hoàn kho khi giao thất bại (FAILED)", () => {
    it("complete FAILED → tồn kho HOÀN về đúng mức trước prepare", async () => {
      const owned = await createReadyMission();
      const afterPrepare = await stockOfBatch(owned.batchId);

      const response = await http
        .post(`/api/missions/${owned.missionId}/complete`)
        .set(auth("rescue"))
        .send({ outcome: "FAILED", note: "Đường ngập sâu, không tiếp cận được" })
        .expect(201);

      expect(response.body.deliveryOutcome).toBe("FAILED");
      expect(await stockOfBatch(owned.batchId)).toBe(afterPrepare + owned.allocatedQuantity);
      expect(await stockOfBatch(owned.batchId)).toBe(owned.initialQuantity);
    });

    it("complete PARTIAL → KHÔNG đụng kho (chờ đối soát tay)", async () => {
      const owned = await createReadyMission();
      const afterPrepare = await stockOfBatch(owned.batchId);

      await http
        .post(`/api/missions/${owned.missionId}/complete`)
        .set(auth("rescue"))
        .send({ outcome: "PARTIAL", note: "Giao được khoảng 60%" })
        .expect(201);

      expect(await stockOfBatch(owned.batchId)).toBe(afterPrepare);
    });
  });

  describe("Guard trạng thái", () => {
    it("đã có một kho xuất thì ADMIN không huỷ và RESCUE không rút mission", async () => {
      const owned = await createMultiWarehouseMissionFixture();
      await dispatchAndConfirm(owned.missionId);
      await http
        .post(`/api/missions/${owned.missionId}/prepare`)
        .set(auth("warehouse"))
        .expect(201);

      await http
        .post(`/api/missions/${owned.missionId}/cancel`)
        .set(auth("admin"))
        .send({ note: "Dừng nhiệm vụ" })
        .expect(400);
      await http
        .post(`/api/missions/${owned.missionId}/reject`)
        .set(auth("rescue"))
        .send({ reason: "Không tiếp cận được" })
        .expect(400);

      expect(
        (await database().mission.findUniqueOrThrow({
          where: { id: owned.missionId },
        })).status,
      ).toBe(MissionStatus.PENDING_WAREHOUSE);
      expect(await stockOfBatch(owned.batchAId)).toBe(
        initialBatchQuantity - owned.allocationA,
      );
      expect(await stockOfBatch(owned.batchBId)).toBe(initialBatchQuantity);
    });

    it("complete lần 2 trên mission đã COMPLETED → 400", async () => {
      const owned = await createReadyMission();
      await http
        .post(`/api/missions/${owned.missionId}/complete`)
        .set(auth("rescue"))
        .send({ outcome: "DELIVERED" })
        .expect(201);

      await http
        .post(`/api/missions/${owned.missionId}/complete`)
        .set(auth("rescue"))
        .send({ outcome: "DELIVERED" })
        .expect(400);
    });

    it("confirm khi đã qua bước (PENDING_WAREHOUSE) → 400", async () => {
      const owned = await createMissionFixture();
      await dispatchAndConfirm(owned.missionId);

      await http.post(`/api/missions/${owned.missionId}/confirm`).set(auth("rescue")).expect(400);
    });
  });

  describe("RBAC", () => {
    it("RESCUE gọi dispatch (quyền MISSION_CREATE) → 403", async () => {
      const owned = await createMissionFixture();

      await http.post(`/api/missions/${owned.missionId}/dispatch`).set(auth("rescue")).expect(403);
    });

    it("WAREHOUSE gọi complete (quyền MISSION_CONFIRM) → 403", async () => {
      const owned = await createMissionFixture();

      await http
        .post(`/api/missions/${owned.missionId}/complete`)
        .set(auth("warehouse"))
        .send({ outcome: "DELIVERED" })
        .expect(403);
    });

    it("không token → 401", async () => {
      const owned = await createMissionFixture();

      await http.get(`/api/missions/${owned.missionId}`).expect(401);
    });
  });
});
