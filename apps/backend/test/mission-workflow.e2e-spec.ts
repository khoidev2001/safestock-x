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
        // Duyệt phương án đòi điểm nạn đã ghim toạ độ: không có điểm đến thì không
        // tính được kho gần nhất.
        incidentLat: 13.3833,
        incidentLng: 108.9,
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
            // Phần cấp phải ghi rõ thuộc kho nào: yêu cầu xuất hàng được sinh
            // theo từng cặp (kho, vật tư), nên thiếu kho là không ai nhận việc.
            allocations: [
              {
                batchId: batch.id,
                qty: allocatedQuantity,
                warehouseId: owned.warehouseId,
                warehouseName: "Kho E2E mission workflow",
              },
            ] as Prisma.InputJsonValue,
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
        // Duyệt phương án đòi điểm nạn đã ghim toạ độ: không có điểm đến thì không
        // tính được kho gần nhất.
        incidentLat: 13.3833,
        incidentLng: 108.9,
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

  /**
   * Xã phát hành phương án thẳng tới kho: DRAFT → PENDING_WAREHOUSE. Lực lượng
   * hiện trường không tham gia bước này, họ chỉ đóng nhiệm vụ ở cuối.
   */
  async function approveMission(missionId: string): Promise<void> {
    await http.post(`/api/missions/${missionId}/approve`).set(auth("admin")).expect(201);
  }

  /**
   * Yêu cầu vật tư CHƯA xuất của một kho trong nhiệm vụ, theo từng SKU (ADR-004).
   * Cái đã PREPARED vẫn nằm trong danh sách để tra cứu, nhưng không còn việc.
   */
  async function pendingRequestsOf(
    role: TokenRole,
    missionId: string,
  ): Promise<{ id: string; sku: string; status: string }[]> {
    const response = await http
      .get("/api/missions/warehouse-requests/own")
      .set(auth(role))
      .expect(200);
    return (
      response.body as {
        id: string;
        sku: string;
        status: string;
        mission: { id: string };
      }[]
    )
      .filter((request) => request.mission.id === missionId && request.status !== "PREPARED")
      .map(({ id, sku, status }) => ({ id, sku, status }));
  }

  /**
   * Kho xuất hàng theo TỪNG vật tư: tiếp nhận rồi báo đã chuẩn bị cho mỗi SKU.
   * Kho cuối cùng hoàn tất phần của mình sẽ đẩy nhiệm vụ sang READY.
   * Trả về số SKU thực sự còn phải xuất trong lượt này.
   */
  async function prepareAllRequests(role: TokenRole, missionId: string): Promise<number> {
    const requests = await pendingRequestsOf(role, missionId);
    for (const request of requests) {
      await http
        .post(`/api/missions/warehouse-requests/${request.id}/accept`)
        .set(auth(role))
        .send({})
        .expect(201);
      await http
        .post(`/api/missions/warehouse-requests/${request.id}/prepare`)
        .set(auth(role))
        .send({})
        .expect(201);
    }
    return requests.length;
  }

  async function createReadyMission(): Promise<MissionFixture> {
    const owned = await createMissionFixture();
    await approveMission(owned.missionId);
    await prepareAllRequests("warehouse", owned.missionId);
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
    it("chuẩn bị theo từng vật tư TRỪ tồn kho đúng phần đã cấp", async () => {
      const owned = await createMissionFixture();
      const before = await stockOfBatch(owned.batchId);

      await approveMission(owned.missionId);
      expect(await prepareAllRequests("warehouse", owned.missionId)).toBeGreaterThan(0);

      expect(await stockOfBatch(owned.batchId)).toBe(before - owned.allocatedQuantity);
    });

    it("mission đa kho chỉ xuất phần từng kho, retry-safe và READY sau kho cuối", async () => {
      const owned = await createMultiWarehouseMissionFixture();
      await approveMission(owned.missionId);

      const visibleToWarehouseB = await http
        .get(`/api/missions/${owned.missionId}`)
        .set(auth("warehouseB"))
        .expect(200);
      expect(visibleToWarehouseB.body.warehousePreparations).toHaveLength(2);

      // Kho A xong phần của mình: chỉ tồn kho A giảm, nhiệm vụ vẫn chờ kho B.
      await prepareAllRequests("warehouse", owned.missionId);
      const afterWarehouseA = await http
        .get(`/api/missions/${owned.missionId}`)
        .set(auth("warehouse"))
        .expect(200);
      expect(afterWarehouseA.body.status).toBe("PENDING_WAREHOUSE");
      expect(await stockOfBatch(owned.batchAId)).toBe(initialBatchQuantity - owned.allocationA);
      expect(await stockOfBatch(owned.batchBId)).toBe(initialBatchQuantity);

      // Kho A bấm lại: yêu cầu đã PREPARED nên không còn gì để xuất lần hai.
      expect(await prepareAllRequests("warehouse", owned.missionId)).toBe(0);
      expect(await stockOfBatch(owned.batchAId)).toBe(initialBatchQuantity - owned.allocationA);

      await prepareAllRequests("warehouseB", owned.missionId);
      const afterWarehouseB = await http
        .get(`/api/missions/${owned.missionId}`)
        .set(auth("warehouseB"))
        .expect(200);
      expect(afterWarehouseB.body.status).toBe("READY");
      expect(await stockOfBatch(owned.batchBId)).toBe(initialBatchQuantity - owned.allocationB);

      expect(await prepareAllRequests("warehouseB", owned.missionId)).toBe(0);
      expect(await stockOfBatch(owned.batchBId)).toBe(initialBatchQuantity - owned.allocationB);

      // Mỗi kho xuất đúng một lần cho phần vật tư của mình. Ghi chú sổ sách gắn
      // với YÊU CẦU theo từng SKU, không phải với cả nhiệm vụ.
      const exports = await database().inventoryTransaction.count({
        where: {
          batchId: { in: [owned.batchAId, owned.batchBId] },
          type: "EXPORT",
          note: { startsWith: "Yêu cầu vật tư " },
        },
      });
      expect(exports).toBe(2);
    });

    it("hai kho prepare đồng thời vẫn có đúng một lần chuyển READY", async () => {
      const owned = await createMultiWarehouseMissionFixture();
      await approveMission(owned.missionId);

      // Hai kho xuất hàng cùng lúc: chỉ kho hoàn tất sau cùng được đẩy nhiệm vụ
      // sang READY, và điều đó phải xảy ra đúng một lần.
      await Promise.all([
        prepareAllRequests("warehouse", owned.missionId),
        prepareAllRequests("warehouseB", owned.missionId),
      ]);

      expect(
        (
          await database().mission.findUniqueOrThrow({
            where: { id: owned.missionId },
          })
        ).status,
      ).toBe(MissionStatus.READY);
      expect(await stockOfBatch(owned.batchAId)).toBe(initialBatchQuantity - owned.allocationA);
      expect(await stockOfBatch(owned.batchBId)).toBe(initialBatchQuantity - owned.allocationB);
      // Hai kho chạy song song nhưng mỗi kho vẫn chỉ xuất đúng một lần.
      expect(
        await database().inventoryTransaction.count({
          where: {
            batchId: { in: [owned.batchAId, owned.batchBId] },
            type: "EXPORT",
            note: { startsWith: "Yêu cầu vật tư " },
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
    it("đã có một kho xuất thì ADMIN không huỷ được nữa", async () => {
      const owned = await createMultiWarehouseMissionFixture();
      await approveMission(owned.missionId);
      await prepareAllRequests("warehouse", owned.missionId);

      // Vật tư đã rời kho: huỷ ngược sẽ để lại hàng lơ lửng ngoài sổ sách. Muốn
      // đóng thì phải báo kết quả giao, kể cả khi giao thất bại.
      await http
        .post(`/api/missions/${owned.missionId}/cancel`)
        .set(auth("admin"))
        .send({ note: "Dừng nhiệm vụ" })
        .expect(400);

      expect(
        (
          await database().mission.findUniqueOrThrow({
            where: { id: owned.missionId },
          })
        ).status,
      ).toBe(MissionStatus.PENDING_WAREHOUSE);
      expect(await stockOfBatch(owned.batchAId)).toBe(initialBatchQuantity - owned.allocationA);
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

    it("chưa xuất kho xong thì chưa báo được kết quả giao", async () => {
      // Kho mới nhận lệnh chuẩn bị, hàng chưa ra khỏi kho — không thể đã giao.
      const owned = await createMissionFixture();
      await approveMission(owned.missionId);

      await http
        .post(`/api/missions/${owned.missionId}/complete`)
        .set(auth("rescue"))
        .send({ outcome: "DELIVERED" })
        .expect(400);
    });
  });

  describe("RBAC", () => {
    it("hiện trường không tự phát hành phương án thay xã → 403", async () => {
      const owned = await createMissionFixture();

      await http.post(`/api/missions/${owned.missionId}/approve`).set(auth("rescue")).expect(403);
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
