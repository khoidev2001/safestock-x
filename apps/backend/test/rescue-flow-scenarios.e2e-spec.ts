import { INestApplication, ValidationPipe } from "@nestjs/common";
import {
  MissionStatus,
  MissionWarehouseRequestStatus,
  Prisma,
  UserRole,
  WarehouseKind,
} from "@prisma/client";
import { Test } from "@nestjs/testing";
import * as bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";

/**
 * Ma trận kịch bản luồng cứu hộ trên PostgreSQL thật — phần KHÔNG happy path.
 *
 * `mission-workflow.e2e-spec.ts` đã khoá đường đi đúng (phát hành → kho xuất →
 * ký nhận → báo kết quả). Bộ này đi tìm chỗ vỡ ở các nhánh còn lại: bấm hai lần,
 * bấm sai thứ tự, kho này đụng phiếu kho kia, hàng không đủ, huỷ giữa chừng, và
 * hai người bấm cùng lúc. Đó là những gì thật sự xảy ra lúc mưa bão, khi mạng
 * chập chờn và ai cũng bấm lại lần nữa cho chắc.
 */
type Role = "admin" | "rescue" | "warehouseA" | "warehouseB" | "foreignAdmin" | "foreignRescue";

interface Fixture {
  organizationId: string;
  warehouseAId: string;
  warehouseBId: string;
  zoneAId: string;
  zoneBId: string;
  shelfAId: string;
  shelfBId: string;
  categoryId: string;
  itemId: string;
  itemSku: string;
  itemName: string;
  userIds: string[];
  emails: Record<Role, string>;
  /** Xã KHÁC hoàn toàn — dùng để kiểm tra cách ly dữ liệu giữa các đơn vị. */
  foreignOrganizationId: string;
}

interface MissionSeed {
  missionId: string;
  batchAId: string;
  batchBId: string;
  allocationA: number;
  allocationB: number;
}

describe("Rescue flow scenarios (E2E PostgreSQL)", () => {
  const runId = `${Date.now()}-${randomUUID()}`;
  const batchQuantity = 40;
  const allocationA = 6;
  const allocationB = 4;

  let app: INestApplication | undefined;
  let prisma: PrismaService | undefined;
  let http: ReturnType<typeof request>;
  let owned: Fixture;
  let tokens: Record<Role, string>;

  const missionIds = new Set<string>();
  const batchIds = new Set<string>();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api");
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);
    http = request(app.getHttpServer());

    const password = `${randomUUID()}-${randomUUID()}`;
    const passwordHash = await bcrypt.hash(password, 10);
    // Tên đăng nhập được chuẩn hoá về chữ thường trước khi tra cứu → fixture phải
    // lưu sẵn chữ thường, nếu không thì không tài khoản nào đăng nhập được.
    const emails: Record<Role, string> = {
      admin: `e2e-rescue-admin-${runId}@example.test`.toLowerCase(),
      rescue: `e2e-rescue-field-${runId}@example.test`.toLowerCase(),
      warehouseA: `e2e-rescue-wh-a-${runId}@example.test`.toLowerCase(),
      warehouseB: `e2e-rescue-wh-b-${runId}@example.test`.toLowerCase(),
      foreignAdmin: `e2e-rescue-foreign-admin-${runId}@example.test`.toLowerCase(),
      foreignRescue: `e2e-rescue-foreign-field-${runId}@example.test`.toLowerCase(),
    };

    owned = await db().$transaction(async (tx) => {
      const organization = await tx.organization.create({
        data: { name: `E2E rescue scenarios ${runId}` },
      });
      const warehouseA = await tx.warehouse.create({
        data: {
          organizationId: organization.id,
          name: `Kho A rescue ${runId}`,
          kind: WarehouseKind.CENTRAL,
          communeId: `e2e-rescue-${runId}`,
        },
      });
      const warehouseB = await tx.warehouse.create({
        data: {
          organizationId: organization.id,
          name: `Kho B rescue ${runId}`,
          kind: WarehouseKind.HAMLET,
          communeId: `e2e-rescue-${runId}`,
        },
      });
      const zoneA = await tx.warehouseZone.create({
        data: { warehouseId: warehouseA.id, code: `RS-A-${runId}`, name: "Khu A" },
      });
      const zoneB = await tx.warehouseZone.create({
        data: { warehouseId: warehouseB.id, code: `RS-B-${runId}`, name: "Khu B" },
      });
      const shelfA = await tx.shelf.create({ data: { zoneId: zoneA.id, code: `RS-A-${runId}` } });
      const shelfB = await tx.shelf.create({ data: { zoneId: zoneB.id, code: `RS-B-${runId}` } });
      const category = await tx.itemCategory.create({
        data: { name: `Danh mục rescue ${runId}`, unit: "gói" },
      });
      const item = await tx.item.create({
        data: {
          categoryId: category.id,
          name: "Vật tư rescue scenarios",
          sku: `E2E-RESCUE-${runId}`,
          consumable: true,
        },
      });
      const users = await Promise.all([
        tx.user.create({
          data: {
            organizationId: organization.id,
            email: emails.admin,
            passwordHash,
            fullName: "Điều phối rescue scenarios",
            role: UserRole.ADMIN,
          },
        }),
        tx.user.create({
          data: {
            organizationId: organization.id,
            email: emails.rescue,
            passwordHash,
            fullName: "Hiện trường rescue scenarios",
            role: UserRole.RESCUE,
          },
        }),
        tx.user.create({
          data: {
            organizationId: organization.id,
            email: emails.warehouseA,
            passwordHash,
            fullName: "Kho A rescue scenarios",
            role: UserRole.WAREHOUSE,
            warehouseId: warehouseA.id,
          },
        }),
        tx.user.create({
          data: {
            organizationId: organization.id,
            email: emails.warehouseB,
            passwordHash,
            fullName: "Kho B rescue scenarios",
            role: UserRole.WAREHOUSE,
            warehouseId: warehouseB.id,
          },
        }),
      ]);
      const foreignOrganization = await tx.organization.create({
        data: { name: `E2E rescue xã khác ${runId}` },
      });
      const foreignUsers = await Promise.all([
        tx.user.create({
          data: {
            organizationId: foreignOrganization.id,
            email: emails.foreignAdmin,
            passwordHash,
            fullName: "Điều phối xã khác",
            role: UserRole.ADMIN,
          },
        }),
        tx.user.create({
          data: {
            organizationId: foreignOrganization.id,
            email: emails.foreignRescue,
            passwordHash,
            fullName: "Hiện trường xã khác",
            role: UserRole.RESCUE,
          },
        }),
      ]);

      return {
        foreignOrganizationId: foreignOrganization.id,
        organizationId: organization.id,
        warehouseAId: warehouseA.id,
        warehouseBId: warehouseB.id,
        zoneAId: zoneA.id,
        zoneBId: zoneB.id,
        shelfAId: shelfA.id,
        shelfBId: shelfB.id,
        categoryId: category.id,
        itemId: item.id,
        itemSku: item.sku,
        itemName: item.name,
        userIds: [...users, ...foreignUsers].map((user) => user.id),
        emails,
      };
    });

    tokens = {
      admin: await login(emails.admin, password),
      rescue: await login(emails.rescue, password),
      warehouseA: await login(emails.warehouseA, password),
      warehouseB: await login(emails.warehouseB, password),
      foreignAdmin: await login(emails.foreignAdmin, password),
      foreignRescue: await login(emails.foreignRescue, password),
    };
  });

  afterEach(async () => {
    await cleanupRuntime();
  });

  afterAll(async () => {
    if (prisma && owned) {
      await cleanupRuntime();
      const database = db();
      await database.user.deleteMany({ where: { id: { in: owned.userIds } } });
      await database.shelf.deleteMany({ where: { id: { in: [owned.shelfAId, owned.shelfBId] } } });
      await database.warehouseZone.deleteMany({
        where: { id: { in: [owned.zoneAId, owned.zoneBId] } },
      });
      await database.item.deleteMany({ where: { id: owned.itemId } });
      await database.itemCategory.deleteMany({ where: { id: owned.categoryId } });
      await database.warehouse.deleteMany({
        where: { id: { in: [owned.warehouseAId, owned.warehouseBId] } },
      });
      await database.organization.deleteMany({
        where: { id: { in: [owned.organizationId, owned.foreignOrganizationId] } },
      });
    }
    if (app) await app.close();
  });

  function db(): PrismaService {
    if (!prisma) throw new Error("Prisma chưa khởi tạo");
    return prisma;
  }

  async function login(email: string, password: string): Promise<string> {
    const response = await http.post("/api/auth/login").send({ email, password }).expect(201);
    return response.body.accessToken as string;
  }

  function auth(role: Role) {
    return { Authorization: `Bearer ${tokens[role]}` };
  }

  async function cleanupRuntime(): Promise<void> {
    if (!prisma || !owned) return;
    const database = db();
    const ownedMissionIds = [...missionIds];
    const ownedBatchIds = [...batchIds];
    if (ownedMissionIds.length > 0) {
      await database.notification.deleteMany({ where: { missionId: { in: ownedMissionIds } } });
    }
    if (ownedBatchIds.length > 0) {
      await database.inventoryTransaction.deleteMany({
        where: { batchId: { in: ownedBatchIds } },
      });
      await database.inventoryCount.deleteMany({ where: { batchId: { in: ownedBatchIds } } });
      await database.loanRecord.deleteMany({ where: { batchId: { in: ownedBatchIds } } });
      await database.auditLog.deleteMany({
        where: { actorId: { in: owned.userIds }, entityId: { in: ownedBatchIds } },
      });
    }
    if (ownedMissionIds.length > 0) {
      await database.mission.deleteMany({ where: { id: { in: ownedMissionIds } } });
    }
    if (ownedBatchIds.length > 0) {
      await database.itemBatch.deleteMany({ where: { id: { in: ownedBatchIds } } });
    }
    missionIds.clear();
    batchIds.clear();
  }

  /**
   * Nhiệm vụ DRAFT đã có phương án phân bổ sẵn cho hai kho — chỗ bắt đầu chung
   * của gần hết kịch bản dưới đây.
   */
  async function seedMission(options?: {
    allocationA?: number;
    allocationB?: number;
    stockA?: number;
    withIncidentPoint?: boolean;
  }): Promise<MissionSeed> {
    const database = db();
    const qtyA = options?.allocationA ?? allocationA;
    const qtyB = options?.allocationB ?? allocationB;
    const uniqueId = `${Date.now()}-${randomUUID()}`;
    const [batchA, batchB] = await database.$transaction([
      database.itemBatch.create({
        data: {
          itemId: owned.itemId,
          shelfId: owned.shelfAId,
          batchCode: `E2E-RS-A-${uniqueId}`,
          quantity: options?.stockA ?? batchQuantity,
        },
      }),
      database.itemBatch.create({
        data: {
          itemId: owned.itemId,
          shelfId: owned.shelfBId,
          batchCode: `E2E-RS-B-${uniqueId}`,
          quantity: batchQuantity,
        },
      }),
    ]);
    batchIds.add(batchA.id);
    batchIds.add(batchB.id);

    const allocations: Prisma.InputJsonValue = [
      ...(qtyA > 0
        ? [
            {
              batchId: batchA.id,
              qty: qtyA,
              warehouseId: owned.warehouseAId,
              warehouseName: "Kho A",
            },
          ]
        : []),
      ...(qtyB > 0
        ? [
            {
              batchId: batchB.id,
              qty: qtyB,
              warehouseId: owned.warehouseBId,
              warehouseName: "Kho B",
            },
          ]
        : []),
    ];

    const mission = await database.mission.create({
      data: {
        warehouseId: owned.warehouseAId,
        incidentType: "FLOOD",
        affectedPeople: 30,
        durationHours: 24,
        priority: "HIGH",
        status: MissionStatus.DRAFT,
        fulfillment: 100,
        ...(options?.withIncidentPoint === false
          ? {}
          : { incidentLat: 13.3833, incidentLng: 108.9 }),
        parsedInput: {
          incidentType: "FLOOD",
          affectedPeople: 30,
          durationHours: 24,
          children: 3,
          elderly: 2,
          medicalSupportCases: 0,
        },
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
            required: qtyA + qtyB,
            allocated: qtyA + qtyB,
            shortage: 0,
            unit: "gói",
            allocations,
          },
        },
      },
    });
    missionIds.add(mission.id);
    return {
      missionId: mission.id,
      batchAId: batchA.id,
      batchBId: batchB.id,
      allocationA: qtyA,
      allocationB: qtyB,
    };
  }

  async function approve(missionId: string): Promise<void> {
    await http.post(`/api/missions/${missionId}/approve`).set(auth("admin")).expect(201);
  }

  async function requestsOf(role: Role, missionId: string) {
    const response = await http
      .get("/api/missions/warehouse-requests/own")
      .set(auth(role))
      .expect(200);
    return (
      response.body as {
        id: string;
        status: string;
        preparedQuantity: number;
        requestedQuantity: number;
        mission: { id: string };
      }[]
    ).filter((item) => item.mission.id === missionId);
  }

  async function firstRequestOf(role: Role, missionId: string) {
    const rows = await requestsOf(role, missionId);
    if (rows.length === 0) throw new Error(`Không có phiếu vật tư cho ${role}`);
    return rows[0];
  }

  async function acceptAndPrepare(role: Role, missionId: string): Promise<string> {
    const requestRow = await firstRequestOf(role, missionId);
    await http
      .post(`/api/missions/warehouse-requests/${requestRow.id}/accept`)
      .set(auth(role))
      .send({})
      .expect(201);
    await http
      .post(`/api/missions/warehouse-requests/${requestRow.id}/prepare`)
      .set(auth(role))
      .send({})
      .expect(201);
    return requestRow.id;
  }

  async function stockOf(batchId: string): Promise<number> {
    const batch = await db().itemBatch.findUniqueOrThrow({ where: { id: batchId } });
    return batch.quantity;
  }

  async function statusOf(missionId: string): Promise<MissionStatus> {
    const mission = await db().mission.findUniqueOrThrow({ where: { id: missionId } });
    return mission.status;
  }

  // ===================================================================
  // 1. Phát hành phương án
  // ===================================================================
  describe("1. Phát hành phương án (approve)", () => {
    it("1.1 nhiệm vụ chưa ghim toạ độ điểm nạn thì không phát hành được", async () => {
      const seed = await seedMission({ withIncidentPoint: false });
      const response = await http
        .post(`/api/missions/${seed.missionId}/approve`)
        .set(auth("admin"))
        .expect(400);
      expect(String(response.body.message)).toMatch(/toạ độ|tọa độ|điểm/i);
      expect(await statusOf(seed.missionId)).toBe(MissionStatus.DRAFT);
    });

    it("1.2 phát hành lần hai bị chặn, không sinh thêm phiếu vật tư", async () => {
      const seed = await seedMission();
      await approve(seed.missionId);
      const afterFirst = await db().missionWarehouseRequest.count({
        where: { missionId: seed.missionId },
      });
      await http
        .post(`/api/missions/${seed.missionId}/approve`)
        .set(auth("admin"))
        .expect(400);
      expect(
        await db().missionWarehouseRequest.count({ where: { missionId: seed.missionId } }),
      ).toBe(afterFirst);
    });

    it("1.3 nhiệm vụ đã huỷ thì không phát hành lại được", async () => {
      const seed = await seedMission();
      await http
        .post(`/api/missions/${seed.missionId}/cancel`)
        .set(auth("admin"))
        .send({ note: "Nước rút" })
        .expect(201);
      await http
        .post(`/api/missions/${seed.missionId}/approve`)
        .set(auth("admin"))
        .expect(400);
      expect(await statusOf(seed.missionId)).toBe(MissionStatus.CANCELLED);
    });

    it("1.4 hiện trường không phát hành thay điều phối", async () => {
      const seed = await seedMission();
      await http
        .post(`/api/missions/${seed.missionId}/approve`)
        .set(auth("rescue"))
        .expect(403);
      expect(await statusOf(seed.missionId)).toBe(MissionStatus.DRAFT);
    });

    it("1.5 phát hành sinh đúng một phiếu cho mỗi cặp (kho, vật tư)", async () => {
      const seed = await seedMission();
      await approve(seed.missionId);
      const rows = await db().missionWarehouseRequest.findMany({
        where: { missionId: seed.missionId },
      });
      expect(rows).toHaveLength(2);
      expect(rows.every((row) => row.status === MissionWarehouseRequestStatus.PENDING)).toBe(true);
      expect(new Set(rows.map((row) => row.warehouseId))).toEqual(
        new Set([owned.warehouseAId, owned.warehouseBId]),
      );
      expect(await statusOf(seed.missionId)).toBe(MissionStatus.PENDING_WAREHOUSE);
    });
  });

  // ===================================================================
  // 2. Kho tiếp nhận, báo chênh lệch, điều phối duyệt lại
  // ===================================================================
  describe("2. Tiếp nhận và duyệt lại phiếu vật tư", () => {
    it("2.1 tiếp nhận hai lần là idempotent, không đẻ thông báo thứ hai", async () => {
      const seed = await seedMission();
      await approve(seed.missionId);
      const requestRow = await firstRequestOf("warehouseA", seed.missionId);
      await http
        .post(`/api/missions/warehouse-requests/${requestRow.id}/accept`)
        .set(auth("warehouseA"))
        .send({})
        .expect(201);
      const afterFirst = await db().notification.count({
        where: { missionId: seed.missionId, kind: "WAREHOUSE_REQUEST_ACCEPTED" },
      });
      await http
        .post(`/api/missions/warehouse-requests/${requestRow.id}/accept`)
        .set(auth("warehouseA"))
        .send({})
        .expect(201);
      expect(
        await db().notification.count({
          where: { missionId: seed.missionId, kind: "WAREHOUSE_REQUEST_ACCEPTED" },
        }),
      ).toBe(afterFirst);
    });

    it("2.2 kho B không tiếp nhận được phiếu của kho A", async () => {
      const seed = await seedMission();
      await approve(seed.missionId);
      const requestRow = await firstRequestOf("warehouseA", seed.missionId);
      await http
        .post(`/api/missions/warehouse-requests/${requestRow.id}/accept`)
        .set(auth("warehouseB"))
        .send({})
        .expect(404);
      const stored = await db().missionWarehouseRequest.findUniqueOrThrow({
        where: { id: requestRow.id },
      });
      expect(stored.status).toBe(MissionWarehouseRequestStatus.PENDING);
    });

    it("2.3 báo chênh lệch phải kèm lý do", async () => {
      const seed = await seedMission();
      await approve(seed.missionId);
      const requestRow = await firstRequestOf("warehouseA", seed.missionId);
      await http
        .post(`/api/missions/warehouse-requests/${requestRow.id}/discrepancy`)
        .set(auth("warehouseA"))
        .send({ note: "  " })
        .expect(400);
    });

    it("2.4 điều phối giảm số → phiếu quay về chờ tiếp nhận, kho phải nhận lại", async () => {
      const seed = await seedMission();
      await approve(seed.missionId);
      const requestRow = await firstRequestOf("warehouseA", seed.missionId);
      await http
        .post(`/api/missions/warehouse-requests/${requestRow.id}/accept`)
        .set(auth("warehouseA"))
        .send({})
        .expect(201);
      await http
        .post(`/api/missions/warehouse-requests/${requestRow.id}/review`)
        .set(auth("admin"))
        .send({ requestedQuantity: 2, adminNote: "Chia bớt cho xã bên" })
        .expect(201);
      const afterReview = await db().missionWarehouseRequest.findUniqueOrThrow({
        where: { id: requestRow.id },
      });
      expect(afterReview.status).toBe(MissionWarehouseRequestStatus.PENDING);
      expect(afterReview.requestedQuantity).toBe(2);
      expect(afterReview.acceptedAt).toBeNull();

      // Chưa nhận lại thì chưa xuất được.
      await http
        .post(`/api/missions/warehouse-requests/${requestRow.id}/prepare`)
        .set(auth("warehouseA"))
        .send({})
        .expect(400);
    });

    it("2.5 duyệt lại số đã giảm thì xuất kho đúng số mới", async () => {
      const seed = await seedMission();
      const before = await stockOf(seed.batchAId);
      await approve(seed.missionId);
      const requestRow = await firstRequestOf("warehouseA", seed.missionId);
      await http
        .post(`/api/missions/warehouse-requests/${requestRow.id}/review`)
        .set(auth("admin"))
        .send({ requestedQuantity: 2 })
        .expect(201);
      await http
        .post(`/api/missions/warehouse-requests/${requestRow.id}/accept`)
        .set(auth("warehouseA"))
        .send({})
        .expect(201);
      await http
        .post(`/api/missions/warehouse-requests/${requestRow.id}/prepare`)
        .set(auth("warehouseA"))
        .send({})
        .expect(201);
      expect(await stockOf(seed.batchAId)).toBe(before - 2);
    });

    it("2.6 không duyệt lại được phiếu đã xuất kho", async () => {
      const seed = await seedMission();
      await approve(seed.missionId);
      const requestId = await acceptAndPrepare("warehouseA", seed.missionId);
      await http
        .post(`/api/missions/warehouse-requests/${requestId}/review`)
        .set(auth("admin"))
        .send({ requestedQuantity: 1 })
        .expect(400);
    });

    it("2.7 không báo chênh lệch được sau khi đã xuất kho", async () => {
      const seed = await seedMission();
      await approve(seed.missionId);
      const requestId = await acceptAndPrepare("warehouseA", seed.missionId);
      await http
        .post(`/api/missions/warehouse-requests/${requestId}/discrepancy`)
        .set(auth("warehouseA"))
        .send({ note: "Lô bị ướt" })
        .expect(400);
    });

    it("2.8 kho không tự duyệt lại số của mình", async () => {
      const seed = await seedMission();
      await approve(seed.missionId);
      const requestRow = await firstRequestOf("warehouseA", seed.missionId);
      await http
        .post(`/api/missions/warehouse-requests/${requestRow.id}/review`)
        .set(auth("warehouseA"))
        .send({ requestedQuantity: 1 })
        .expect(403);
    });

    it("2.9 duyệt lại về 0 bị chặn ở tầng dữ liệu vào", async () => {
      const seed = await seedMission();
      await approve(seed.missionId);
      const requestRow = await firstRequestOf("warehouseA", seed.missionId);
      await http
        .post(`/api/missions/warehouse-requests/${requestRow.id}/review`)
        .set(auth("admin"))
        .send({ requestedQuantity: 0 })
        .expect(400);
    });
  });

  // ===================================================================
  // 3. Chuẩn bị và xuất kho
  // ===================================================================
  describe("3. Chuẩn bị và xuất kho (prepare)", () => {
    it("3.1 chưa tiếp nhận thì không xuất được", async () => {
      const seed = await seedMission();
      await approve(seed.missionId);
      const requestRow = await firstRequestOf("warehouseA", seed.missionId);
      const before = await stockOf(seed.batchAId);
      await http
        .post(`/api/missions/warehouse-requests/${requestRow.id}/prepare`)
        .set(auth("warehouseA"))
        .send({})
        .expect(400);
      expect(await stockOf(seed.batchAId)).toBe(before);
    });

    it("3.2 bấm xuất hai lần chỉ trừ kho một lần", async () => {
      const seed = await seedMission();
      const before = await stockOf(seed.batchAId);
      await approve(seed.missionId);
      const requestId = await acceptAndPrepare("warehouseA", seed.missionId);
      await http
        .post(`/api/missions/warehouse-requests/${requestId}/prepare`)
        .set(auth("warehouseA"))
        .send({})
        .expect(201);
      expect(await stockOf(seed.batchAId)).toBe(before - seed.allocationA);
    });

    it("3.3 hàng bị lấy mất sau khi phát hành: xuất kho từ chối, không trừ một phần nào", async () => {
      // Kịch bản thật: phát hành lúc kho còn đủ, nhưng tới lúc người trực kho bấm
      // xuất thì phần hàng đó đã đi theo việc khác. Bước xuất phải từ chối SẠCH —
      // trừ được một phần rồi mới vỡ là số liệu kho sai mà không ai biết.
      const seed = await seedMission();
      await approve(seed.missionId);
      const requestRow = await firstRequestOf("warehouseA", seed.missionId);
      await http
        .post(`/api/missions/warehouse-requests/${requestRow.id}/accept`)
        .set(auth("warehouseA"))
        .send({})
        .expect(201);
      await db().itemBatch.update({
        where: { id: seed.batchAId },
        data: { quantity: seed.allocationA - 1 },
      });

      await http
        .post(`/api/missions/warehouse-requests/${requestRow.id}/prepare`)
        .set(auth("warehouseA"))
        .send({})
        .expect(400);

      expect(await stockOf(seed.batchAId)).toBe(seed.allocationA - 1);
      const stored = await db().missionWarehouseRequest.findUniqueOrThrow({
        where: { id: requestRow.id },
      });
      // Claim token phải được rollback cùng transaction, nếu không phiếu kẹt
      // vĩnh viễn: bấm lại báo "đang được xử lý" mà chẳng có ai đang xử lý.
      expect(stored.preparationClaimToken).toBeNull();
      expect(stored.status).toBe(MissionWarehouseRequestStatus.ACCEPTED);
      expect(await statusOf(seed.missionId)).toBe(MissionStatus.PENDING_WAREHOUSE);
      expect(
        await db().inventoryTransaction.count({ where: { batchId: seed.batchAId } }),
      ).toBe(0);
    });

    it("3.3b phát hành bị chặn ngay nếu kho không còn đủ hàng cho phương án", async () => {
      // Chặn ở đúng chỗ người vừa gây ra nó: phương án đòi 10, kho chỉ còn 3 →
      // 409 kèm câu nói rõ kho nào thiếu, thay vì để lỗi nổ ở kho vài giờ sau.
      const seed = await seedMission({ allocationA: 10, stockA: 3 });
      const response = await http
        .post(`/api/missions/${seed.missionId}/approve`)
        .set(auth("admin"))
        .expect(409);
      expect(String(response.body.message)).toMatch(/Chưa phát hành được/i);
      expect(await statusOf(seed.missionId)).toBe(MissionStatus.DRAFT);
      expect(await stockOf(seed.batchAId)).toBe(3);
    });

    it("3.4 kho B không xuất được phiếu của kho A", async () => {
      const seed = await seedMission();
      await approve(seed.missionId);
      const requestRow = await firstRequestOf("warehouseA", seed.missionId);
      await http
        .post(`/api/missions/warehouse-requests/${requestRow.id}/prepare`)
        .set(auth("warehouseB"))
        .send({})
        .expect(404);
      expect(await stockOf(seed.batchAId)).toBe(batchQuantity);
    });

    it("3.5 hiện trường không có quyền xuất kho", async () => {
      const seed = await seedMission();
      await approve(seed.missionId);
      const requestRow = await firstRequestOf("warehouseA", seed.missionId);
      await http
        .post(`/api/missions/warehouse-requests/${requestRow.id}/prepare`)
        .set(auth("rescue"))
        .send({})
        .expect(403);
    });

    it("3.6 nhiệm vụ chỉ READY sau khi kho cuối cùng xuất xong", async () => {
      const seed = await seedMission();
      await approve(seed.missionId);
      await acceptAndPrepare("warehouseA", seed.missionId);
      expect(await statusOf(seed.missionId)).toBe(MissionStatus.PENDING_WAREHOUSE);
      await acceptAndPrepare("warehouseB", seed.missionId);
      expect(await statusOf(seed.missionId)).toBe(MissionStatus.READY);
      expect(await stockOf(seed.batchAId)).toBe(batchQuantity - seed.allocationA);
      expect(await stockOf(seed.batchBId)).toBe(batchQuantity - seed.allocationB);
    });

    it("3.7 nhiệm vụ đã huỷ thì kho không xuất được nữa", async () => {
      const seed = await seedMission();
      await approve(seed.missionId);
      const requestRow = await firstRequestOf("warehouseA", seed.missionId);
      await http
        .post(`/api/missions/warehouse-requests/${requestRow.id}/accept`)
        .set(auth("warehouseA"))
        .send({})
        .expect(201);
      await http
        .post(`/api/missions/${seed.missionId}/cancel`)
        .set(auth("admin"))
        .send({ note: "Đổi phương án" })
        .expect(201);
      await http
        .post(`/api/missions/warehouse-requests/${requestRow.id}/prepare`)
        .set(auth("warehouseA"))
        .send({})
        .expect(400);
      expect(await stockOf(seed.batchAId)).toBe(batchQuantity);
    });

    it("3.8 hai lượt xuất cùng phiếu chạy song song chỉ trừ kho một lần", async () => {
      const seed = await seedMission();
      await approve(seed.missionId);
      const requestRow = await firstRequestOf("warehouseA", seed.missionId);
      await http
        .post(`/api/missions/warehouse-requests/${requestRow.id}/accept`)
        .set(auth("warehouseA"))
        .send({})
        .expect(201);
      const [first, second] = await Promise.all([
        http
          .post(`/api/missions/warehouse-requests/${requestRow.id}/prepare`)
          .set(auth("warehouseA"))
          .send({}),
        http
          .post(`/api/missions/warehouse-requests/${requestRow.id}/prepare`)
          .set(auth("warehouseA"))
          .send({}),
      ]);
      expect([first.status, second.status].filter((code) => code === 201).length).toBeGreaterThan(
        0,
      );
      expect(await stockOf(seed.batchAId)).toBe(batchQuantity - seed.allocationA);
      const transactions = await db().inventoryTransaction.count({
        where: { batchId: seed.batchAId },
      });
      expect(transactions).toBe(1);
    });
  });

  // ===================================================================
  // 4. Ký nhận bàn giao
  // ===================================================================
  describe("4. Ký nhận bàn giao (pickup)", () => {
    it("4.1 chưa chuẩn bị xong thì chưa ký nhận được", async () => {
      const seed = await seedMission();
      await approve(seed.missionId);
      const requestRow = await firstRequestOf("warehouseA", seed.missionId);
      const response = await http
        .post(`/api/missions/warehouse-requests/${requestRow.id}/pickup`)
        .set(auth("warehouseA"))
        .send({ receivedQuantity: 1 })
        .expect(400);
      expect(String(response.body.message)).toMatch(/chưa chuẩn bị/i);
    });

    it("4.2 ký nhận đủ thì phiếu chuyển sang đã lấy", async () => {
      const seed = await seedMission();
      await approve(seed.missionId);
      const requestId = await acceptAndPrepare("warehouseA", seed.missionId);
      const response = await http
        .post(`/api/missions/warehouse-requests/${requestId}/pickup`)
        .set(auth("warehouseA"))
        .send({ receivedQuantity: seed.allocationA })
        .expect(201);
      expect(response.body.status).toBe(MissionWarehouseRequestStatus.PICKED_UP);
      expect(response.body.pickedUpQuantity).toBe(seed.allocationA);
    });

    it("4.3 ký nhận lần hai bị chặn", async () => {
      const seed = await seedMission();
      await approve(seed.missionId);
      const requestId = await acceptAndPrepare("warehouseA", seed.missionId);
      await http
        .post(`/api/missions/warehouse-requests/${requestId}/pickup`)
        .set(auth("warehouseA"))
        .send({ receivedQuantity: seed.allocationA })
        .expect(201);
      const response = await http
        .post(`/api/missions/warehouse-requests/${requestId}/pickup`)
        .set(auth("warehouseA"))
        .send({ receivedQuantity: seed.allocationA })
        .expect(400);
      expect(String(response.body.message)).toMatch(/đã có người ký nhận/i);
    });

    it("4.4 không ký nhận nhiều hơn số kho đã soạn", async () => {
      const seed = await seedMission();
      await approve(seed.missionId);
      const requestId = await acceptAndPrepare("warehouseA", seed.missionId);
      await http
        .post(`/api/missions/warehouse-requests/${requestId}/pickup`)
        .set(auth("warehouseA"))
        .send({ receivedQuantity: seed.allocationA + 1 })
        .expect(400);
      const stored = await db().missionWarehouseRequest.findUniqueOrThrow({
        where: { id: requestId },
      });
      expect(stored.status).toBe(MissionWarehouseRequestStatus.PREPARED);
    });

    it("4.5 lấy thiếu mà không ghi lý do thì bị chặn", async () => {
      const seed = await seedMission();
      await approve(seed.missionId);
      const requestId = await acceptAndPrepare("warehouseA", seed.missionId);
      const response = await http
        .post(`/api/missions/warehouse-requests/${requestId}/pickup`)
        .set(auth("warehouseA"))
        .send({ receivedQuantity: seed.allocationA - 1 })
        .expect(400);
      expect(String(response.body.message)).toMatch(/lý do/i);
    });

    it("4.6 lấy thiếu có lý do thì ghi nhận và báo điều phối", async () => {
      const seed = await seedMission();
      await approve(seed.missionId);
      const requestId = await acceptAndPrepare("warehouseA", seed.missionId);
      await http
        .post(`/api/missions/warehouse-requests/${requestId}/pickup`)
        .set(auth("warehouseA"))
        .send({ receivedQuantity: seed.allocationA - 2, note: "Xe không chở hết" })
        .expect(201);
      const stored = await db().missionWarehouseRequest.findUniqueOrThrow({
        where: { id: requestId },
      });
      expect(stored.pickedUpQuantity).toBe(seed.allocationA - 2);
      expect(stored.pickupNote).toBe("Xe không chở hết");
      const shortageNotice = await db().notification.findFirst({
        where: { missionId: seed.missionId, title: { contains: "THIẾU" } },
      });
      expect(shortageNotice).not.toBeNull();
    });

    it("4.6b lấy thiếu KHÔNG tự cộng lại phần chưa cầm đi — sổ kho ghi theo số đã soạn", async () => {
      // Ghim hành vi hiện tại để nó không đổi lặng lẽ: bước chuẩn bị đã trừ đủ số
      // yêu cầu, còn bước ký nhận chỉ ghi SỔ chứ không đụng tồn. Phần chưa cầm đi
      // vẫn nằm trên kệ nhưng đã ra khỏi sổ — giống hệt luật của "giao một phần",
      // và cũng chờ người đối soát nhập lại bằng tay.
      const seed = await seedMission();
      await approve(seed.missionId);
      const requestId = await acceptAndPrepare("warehouseA", seed.missionId);
      const afterPrepare = await stockOf(seed.batchAId);
      expect(afterPrepare).toBe(batchQuantity - seed.allocationA);

      await http
        .post(`/api/missions/warehouse-requests/${requestId}/pickup`)
        .set(auth("warehouseA"))
        .send({ receivedQuantity: seed.allocationA - 2, note: "Xe không chở hết" })
        .expect(201);

      expect(await stockOf(seed.batchAId)).toBe(afterPrepare);
    });

    it("4.7 số âm bị chặn ngay ở tầng dữ liệu vào", async () => {
      const seed = await seedMission();
      await approve(seed.missionId);
      const requestId = await acceptAndPrepare("warehouseA", seed.missionId);
      await http
        .post(`/api/missions/warehouse-requests/${requestId}/pickup`)
        .set(auth("warehouseA"))
        .send({ receivedQuantity: -1 })
        .expect(400);
    });

    it("4.8 kho B không ký nhận hộ phiếu của kho A", async () => {
      const seed = await seedMission();
      await approve(seed.missionId);
      const requestId = await acceptAndPrepare("warehouseA", seed.missionId);
      await http
        .post(`/api/missions/warehouse-requests/${requestId}/pickup`)
        .set(auth("warehouseB"))
        .send({ receivedQuantity: seed.allocationA })
        .expect(403);
    });

    it("4.9 hai người bấm ký nhận cùng lúc chỉ có một chữ ký", async () => {
      const seed = await seedMission();
      await approve(seed.missionId);
      const requestId = await acceptAndPrepare("warehouseA", seed.missionId);
      const results = await Promise.all([
        http
          .post(`/api/missions/warehouse-requests/${requestId}/pickup`)
          .set(auth("warehouseA"))
          .send({ receivedQuantity: seed.allocationA }),
        http
          .post(`/api/missions/warehouse-requests/${requestId}/pickup`)
          .set(auth("warehouseA"))
          .send({ receivedQuantity: seed.allocationA }),
      ]);
      expect(results.filter((res) => res.status === 201)).toHaveLength(1);
      expect(results.filter((res) => res.status === 400)).toHaveLength(1);
    });
  });

  // ===================================================================
  // 5. Huỷ nhiệm vụ
  // ===================================================================
  describe("5. Huỷ nhiệm vụ", () => {
    it("5.1 huỷ khi còn là bản nháp", async () => {
      const seed = await seedMission();
      await http
        .post(`/api/missions/${seed.missionId}/cancel`)
        .set(auth("admin"))
        .send({ note: "Báo nhầm" })
        .expect(201);
      expect(await statusOf(seed.missionId)).toBe(MissionStatus.CANCELLED);
    });

    it("5.2 huỷ khi đã phát hành nhưng chưa kho nào xuất", async () => {
      const seed = await seedMission();
      await approve(seed.missionId);
      await http
        .post(`/api/missions/${seed.missionId}/cancel`)
        .set(auth("admin"))
        .send({ note: "Nước rút nhanh" })
        .expect(201);
      expect(await statusOf(seed.missionId)).toBe(MissionStatus.CANCELLED);
      expect(await stockOf(seed.batchAId)).toBe(batchQuantity);
    });

    it("5.3 đã có kho xuất thì không huỷ ngang được", async () => {
      const seed = await seedMission();
      await approve(seed.missionId);
      await acceptAndPrepare("warehouseA", seed.missionId);
      const response = await http
        .post(`/api/missions/${seed.missionId}/cancel`)
        .set(auth("admin"))
        .send({ note: "Đổi ý" })
        .expect(400);
      expect(String(response.body.message)).toMatch(/đã có kho xuất/i);
      expect(await statusOf(seed.missionId)).toBe(MissionStatus.PENDING_WAREHOUSE);
    });

    it("5.4 nhiệm vụ đã sẵn sàng giao thì phải đóng bằng báo kết quả, không huỷ", async () => {
      const seed = await seedMission();
      await approve(seed.missionId);
      await acceptAndPrepare("warehouseA", seed.missionId);
      await acceptAndPrepare("warehouseB", seed.missionId);
      expect(await statusOf(seed.missionId)).toBe(MissionStatus.READY);
      await http
        .post(`/api/missions/${seed.missionId}/cancel`)
        .set(auth("admin"))
        .send({ note: "Đổi ý" })
        .expect(400);
    });

    it("5.5 huỷ lần hai bị chặn", async () => {
      const seed = await seedMission();
      await http
        .post(`/api/missions/${seed.missionId}/cancel`)
        .set(auth("admin"))
        .send({})
        .expect(201);
      await http
        .post(`/api/missions/${seed.missionId}/cancel`)
        .set(auth("admin"))
        .send({})
        .expect(400);
    });
  });

  // ===================================================================
  // 6. Đóng nhiệm vụ
  // ===================================================================
  describe("6. Đóng nhiệm vụ (complete)", () => {
    async function readyMission(): Promise<MissionSeed> {
      const seed = await seedMission();
      await approve(seed.missionId);
      await acceptAndPrepare("warehouseA", seed.missionId);
      await acceptAndPrepare("warehouseB", seed.missionId);
      return seed;
    }

    it("6.1 chưa xuất kho xong thì chưa báo kết quả được", async () => {
      const seed = await seedMission();
      await approve(seed.missionId);
      await acceptAndPrepare("warehouseA", seed.missionId);
      await http
        .post(`/api/missions/${seed.missionId}/complete`)
        .set(auth("rescue"))
        .send({ outcome: "DELIVERED" })
        .expect(400);
    });

    it("6.2 giao đủ thì đóng nhiệm vụ và không đụng tồn kho", async () => {
      const seed = await readyMission();
      await http
        .post(`/api/missions/${seed.missionId}/complete`)
        .set(auth("rescue"))
        .send({ outcome: "DELIVERED", note: "Đã phát cho 30 hộ" })
        .expect(201);
      expect(await statusOf(seed.missionId)).toBe(MissionStatus.COMPLETED);
      expect(await stockOf(seed.batchAId)).toBe(batchQuantity - seed.allocationA);
      expect(await stockOf(seed.batchBId)).toBe(batchQuantity - seed.allocationB);
    });

    it("6.3 không giao được thì vật tư hoàn về đúng lô cũ", async () => {
      const seed = await readyMission();
      await http
        .post(`/api/missions/${seed.missionId}/complete`)
        .set(auth("rescue"))
        .send({ outcome: "FAILED", note: "Đường ngập, không vào được" })
        .expect(201);
      expect(await stockOf(seed.batchAId)).toBe(batchQuantity);
      expect(await stockOf(seed.batchBId)).toBe(batchQuantity);
    });

    it("6.4 giao một phần thì không tự đoán số, kho giữ nguyên chờ đối soát", async () => {
      const seed = await readyMission();
      await http
        .post(`/api/missions/${seed.missionId}/complete`)
        .set(auth("rescue"))
        .send({ outcome: "PARTIAL", note: "Còn 1 thôn chưa vào được" })
        .expect(201);
      expect(await stockOf(seed.batchAId)).toBe(batchQuantity - seed.allocationA);
      expect(await stockOf(seed.batchBId)).toBe(batchQuantity - seed.allocationB);
    });

    it("6.5 báo kết quả lần hai không hoàn kho thêm lần nữa", async () => {
      const seed = await readyMission();
      await http
        .post(`/api/missions/${seed.missionId}/complete`)
        .set(auth("rescue"))
        .send({ outcome: "FAILED" })
        .expect(201);
      await http
        .post(`/api/missions/${seed.missionId}/complete`)
        .set(auth("rescue"))
        .send({ outcome: "FAILED" })
        .expect(400);
      expect(await stockOf(seed.batchAId)).toBe(batchQuantity);
    });

    it("6.6 kết quả ngoài ba giá trị hợp lệ bị từ chối", async () => {
      const seed = await readyMission();
      await http
        .post(`/api/missions/${seed.missionId}/complete`)
        .set(auth("rescue"))
        .send({ outcome: "MAYBE" })
        .expect(400);
      expect(await statusOf(seed.missionId)).toBe(MissionStatus.READY);
    });

    it("6.7 người giữ kho không báo kết quả thay người đi giao", async () => {
      const seed = await readyMission();
      await http
        .post(`/api/missions/${seed.missionId}/complete`)
        .set(auth("warehouseA"))
        .send({ outcome: "DELIVERED" })
        .expect(403);
    });

    it("6.8 hai lượt báo kết quả FAILED song song chỉ hoàn kho một lần", async () => {
      const seed = await readyMission();
      const results = await Promise.all([
        http
          .post(`/api/missions/${seed.missionId}/complete`)
          .set(auth("rescue"))
          .send({ outcome: "FAILED" }),
        http
          .post(`/api/missions/${seed.missionId}/complete`)
          .set(auth("rescue"))
          .send({ outcome: "FAILED" }),
      ]);
      expect(results.filter((res) => res.status === 201)).toHaveLength(1);
      expect(await stockOf(seed.batchAId)).toBe(batchQuantity);
    });

    it("6.9 hoàn kho khi giao hỏng phải theo SỐ ĐÃ XUẤT, không theo phương án gốc", async () => {
      // Điều phối cắt bớt phiếu trước khi kho xuất: kho chỉ xuất phần đã cắt.
      // Nếu bước hoàn kho vẫn cộng theo phương án gốc thì hệ thống tự đẻ ra hàng
      // chưa từng rời kho — sổ nhiều hơn kệ, và không ai phát hiện ra cho tới
      // lượt kiểm kê sau.
      const seed = await seedMission();
      await approve(seed.missionId);
      const requestA = await firstRequestOf("warehouseA", seed.missionId);
      const reducedQuantity = 2;
      await http
        .post(`/api/missions/warehouse-requests/${requestA.id}/review`)
        .set(auth("admin"))
        .send({ requestedQuantity: reducedQuantity })
        .expect(201);
      await http
        .post(`/api/missions/warehouse-requests/${requestA.id}/accept`)
        .set(auth("warehouseA"))
        .send({})
        .expect(201);
      await http
        .post(`/api/missions/warehouse-requests/${requestA.id}/prepare`)
        .set(auth("warehouseA"))
        .send({})
        .expect(201);
      await acceptAndPrepare("warehouseB", seed.missionId);
      expect(await statusOf(seed.missionId)).toBe(MissionStatus.READY);
      expect(await stockOf(seed.batchAId)).toBe(batchQuantity - reducedQuantity);

      await http
        .post(`/api/missions/${seed.missionId}/complete`)
        .set(auth("rescue"))
        .send({ outcome: "FAILED", note: "Đường ngập" })
        .expect(201);

      expect(await stockOf(seed.batchAId)).toBe(batchQuantity);
      expect(await stockOf(seed.batchBId)).toBe(batchQuantity);
    });

    it("6.10 không token thì không đóng được nhiệm vụ", async () => {
      const seed = await readyMission();
      await http
        .post(`/api/missions/${seed.missionId}/complete`)
        .send({ outcome: "DELIVERED" })
        .expect(401);
      expect(await statusOf(seed.missionId)).toBe(MissionStatus.READY);
    });
  });

  // ===================================================================
  // 8. Cách ly giữa các xã
  // ===================================================================
  describe("8. Cách ly dữ liệu giữa các xã", () => {
    it("8.1 điều phối xã khác không mở được nhiệm vụ của xã này", async () => {
      const seed = await seedMission();
      await http
        .get(`/api/missions/${seed.missionId}`)
        .set(auth("foreignAdmin"))
        .expect(404);
    });

    it("8.2 điều phối xã khác không phát hành được nhiệm vụ của xã này", async () => {
      const seed = await seedMission();
      await http
        .post(`/api/missions/${seed.missionId}/approve`)
        .set(auth("foreignAdmin"))
        .expect(404);
      expect(await statusOf(seed.missionId)).toBe(MissionStatus.DRAFT);
    });

    it("8.3 điều phối xã khác không huỷ được nhiệm vụ của xã này", async () => {
      const seed = await seedMission();
      await http
        .post(`/api/missions/${seed.missionId}/cancel`)
        .set(auth("foreignAdmin"))
        .send({ note: "Không phải việc của tôi" })
        .expect(404);
      expect(await statusOf(seed.missionId)).toBe(MissionStatus.DRAFT);
    });

    it("8.4 hiện trường xã khác không đóng được nhiệm vụ của xã này", async () => {
      const seed = await seedMission();
      await approve(seed.missionId);
      await acceptAndPrepare("warehouseA", seed.missionId);
      await acceptAndPrepare("warehouseB", seed.missionId);
      await http
        .post(`/api/missions/${seed.missionId}/complete`)
        .set(auth("foreignRescue"))
        .send({ outcome: "FAILED" })
        .expect(404);
      expect(await statusOf(seed.missionId)).toBe(MissionStatus.READY);
      // Hoàn kho không được chạy: hàng vẫn đang trên đường đi.
      expect(await stockOf(seed.batchAId)).toBe(batchQuantity - seed.allocationA);
    });

    it("8.5 điều phối xã khác không ký nhận hộ phiếu vật tư của xã này", async () => {
      const seed = await seedMission();
      await approve(seed.missionId);
      const requestId = await acceptAndPrepare("warehouseA", seed.missionId);
      await http
        .post(`/api/missions/warehouse-requests/${requestId}/pickup`)
        .set(auth("foreignAdmin"))
        .send({ receivedQuantity: seed.allocationA })
        .expect(404);
      const stored = await db().missionWarehouseRequest.findUniqueOrThrow({
        where: { id: requestId },
      });
      expect(stored.status).toBe(MissionWarehouseRequestStatus.PREPARED);
    });
  });

  // ===================================================================
  // 7. Báo cáo hiện trường đầu luồng
  // ===================================================================
  describe("7. Báo cáo hiện trường", () => {
    it("7.1 không có cả mô tả lẫn ghi âm thì không nhận báo cáo", async () => {
      await http
        .post("/api/missions/report")
        .set(auth("warehouseA"))
        .send({})
        .expect(400);
    });

    it("7.2 mô tả quá ngắn bị chặn ở tầng dữ liệu vào", async () => {
      await http
        .post("/api/missions/report")
        .set(auth("warehouseA"))
        .send({ description: "lũ" })
        .expect(400);
    });

    it("7.3 chỉ gửi một nửa cặp toạ độ thì bị chặn", async () => {
      await http
        .post("/api/missions/report")
        .set(auth("warehouseA"))
        .send({ description: "Nước lũ dâng nhanh tại thôn", incidentLat: 13.38 })
        .expect(400);
    });
  });
});
