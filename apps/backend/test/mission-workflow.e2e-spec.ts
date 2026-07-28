import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";

/**
 * E2E luồng nhiệm vụ liên role qua HTTP + Postgres THẬT (seed sẵn).
 * Chạy: pnpm seed (nếu chưa) → pnpm test:e2e.
 *
 * Kiểm chứng bằng DELTA của chính test (so tồn kho trước/sau) nên không cần
 * teardown — mission rác của lần chạy khác không ảnh hưởng khẳng định.
 */
describe("Mission workflow (E2E)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let http: ReturnType<typeof request>;

  const tokens: Record<string, string> = {};
  const credentials = {
    admin: { email: process.env.SAFESTOCK_E2E_ADMIN_LOGIN, password: process.env.SAFESTOCK_E2E_ADMIN_PASSWORD },
    rescue: { email: process.env.SAFESTOCK_E2E_RESCUE_LOGIN, password: process.env.SAFESTOCK_E2E_RESCUE_PASSWORD },
    warehouse: { email: process.env.SAFESTOCK_E2E_WAREHOUSE_LOGIN, password: process.env.SAFESTOCK_E2E_WAREHOUSE_PASSWORD },
  };

  // Kho trung tâm + tình huống nhỏ để chắc chắn dispatchable.
  let warehouseId: string;
  const incident = {
    incidentType: "FLOOD",
    affectedPeople: 20,
    durationHours: 24,
    children: 2,
    elderly: 2,
    medicalSupportCases: 0,
  };

  async function login(email: string, password: string): Promise<string> {
    const res = await http.post("/api/auth/login").send({ email, password }).expect(201);
    return res.body.accessToken as string;
  }

  /** Tổng tồn kho hiện tại của các lô nằm trong allocations của mission. */
  async function stockOfMissionBatches(missionId: string): Promise<Map<string, number>> {
    const reqs = await prisma.missionRequirement.findMany({ where: { missionId } });
    const batchIds = reqs.flatMap((r) =>
      ((r.allocations as { batchId: string }[] | null) ?? []).map((a) => a.batchId),
    );
    const batches = await prisma.itemBatch.findMany({ where: { id: { in: batchIds } } });
    return new Map(batches.map((b) => [b.id, b.quantity]));
  }

  /** Tổng số lượng đã cấp trong allocations (phần kho phải xuất/hoàn). */
  async function allocatedByBatch(missionId: string): Promise<Map<string, number>> {
    const reqs = await prisma.missionRequirement.findMany({ where: { missionId } });
    const map = new Map<string, number>();
    for (const r of reqs) {
      for (const a of (r.allocations as { batchId: string; qty: number }[] | null) ?? []) {
        map.set(a.batchId, (map.get(a.batchId) ?? 0) + a.qty);
      }
    }
    return map;
  }

  beforeAll(async () => {
    for (const [role, credential] of Object.entries(credentials)) {
      if (!credential.email || !credential.password) {
        throw new Error(`Thiếu biến môi trường credential E2E cho role ${role}`);
      }
    }
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api");
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);
    http = request(app.getHttpServer());

    tokens.admin = await login(credentials.admin.email!, credentials.admin.password!);
    tokens.rescue = await login(credentials.rescue.email!, credentials.rescue.password!);
    tokens.warehouse = await login(credentials.warehouse.email!, credentials.warehouse.password!);

    const central = await prisma.warehouse.findFirstOrThrow({ where: { kind: "CENTRAL" } });
    warehouseId = central.id;
  });

  afterAll(async () => {
    await app.close();
  });

  const auth = (role: string) => ({ Authorization: `Bearer ${tokens[role]}` });

  /** Tạo mission mới tới trạng thái READY (đã xuất kho), trả về id. */
  async function createReadyMission(): Promise<string> {
    const gen = await http
      .post("/api/missions/generate-plan")
      .set(auth("admin"))
      .send({ warehouseId, incident })
      .expect(201);
    const id = gen.body.id as string;
    expect(gen.body.status).toBe("DRAFT");

    await http.post(`/api/missions/${id}/dispatch`).set(auth("admin")).expect(201);
    await http.post(`/api/missions/${id}/confirm`).set(auth("rescue")).expect(201);
    await http.post(`/api/missions/${id}/prepare`).set(auth("warehouse")).expect(201);
    return id;
  }

  describe("Happy path liên role (giao đủ)", () => {
    let missionId: string;

    it("prepare TRỪ tồn kho đúng phần đã cấp", async () => {
      const gen = await http
        .post("/api/missions/generate-plan")
        .set(auth("admin"))
        .send({ warehouseId, incident })
        .expect(201);
      missionId = gen.body.id;

      const before = await stockOfMissionBatches(missionId);
      const allocated = await allocatedByBatch(missionId);
      expect(allocated.size).toBeGreaterThan(0); // có vật tư để xuất

      await http.post(`/api/missions/${missionId}/dispatch`).set(auth("admin")).expect(201);
      await http.post(`/api/missions/${missionId}/confirm`).set(auth("rescue")).expect(201);
      await http.post(`/api/missions/${missionId}/prepare`).set(auth("warehouse")).expect(201);

      const after = await stockOfMissionBatches(missionId);
      for (const [batchId, qty] of allocated) {
        expect(after.get(batchId)).toBe((before.get(batchId) ?? 0) - qty);
      }
    });

    it("complete DELIVERED → COMPLETED, tồn kho GIỮ NGUYÊN (đã giao hết)", async () => {
      const before = await stockOfMissionBatches(missionId);

      const res = await http
        .post(`/api/missions/${missionId}/complete`)
        .set(auth("rescue"))
        .send({ outcome: "DELIVERED", note: "Giao đủ tại điểm tập kết xã" })
        .expect(201);

      expect(res.body.status).toBe("COMPLETED");
      expect(res.body.deliveryOutcome).toBe("DELIVERED");
      expect(res.body.completedAt).toBeTruthy();

      const after = await stockOfMissionBatches(missionId);
      for (const [batchId, qty] of before) expect(after.get(batchId)).toBe(qty);
    });
  });

  describe("Hoàn kho khi giao thất bại (FAILED)", () => {
    it("complete FAILED → tồn kho HOÀN về đúng mức trước prepare", async () => {
      const missionId = await createReadyMission();
      const allocated = await allocatedByBatch(missionId);
      const afterPrepare = await stockOfMissionBatches(missionId);

      const res = await http
        .post(`/api/missions/${missionId}/complete`)
        .set(auth("rescue"))
        .send({ outcome: "FAILED", note: "Đường ngập sâu, không tiếp cận được" })
        .expect(201);
      expect(res.body.deliveryOutcome).toBe("FAILED");

      const afterComplete = await stockOfMissionBatches(missionId);
      for (const [batchId, qty] of allocated) {
        expect(afterComplete.get(batchId)).toBe((afterPrepare.get(batchId) ?? 0) + qty);
      }
    });

    it("complete PARTIAL → KHÔNG đụng kho (chờ đối soát tay)", async () => {
      const missionId = await createReadyMission();
      const afterPrepare = await stockOfMissionBatches(missionId);

      await http
        .post(`/api/missions/${missionId}/complete`)
        .set(auth("rescue"))
        .send({ outcome: "PARTIAL", note: "Giao được ~60%" })
        .expect(201);

      const afterComplete = await stockOfMissionBatches(missionId);
      for (const [batchId, qty] of afterPrepare) expect(afterComplete.get(batchId)).toBe(qty);
    });
  });

  describe("Guard trạng thái", () => {
    it("complete lần 2 trên mission đã COMPLETED → 400", async () => {
      const missionId = await createReadyMission();
      await http
        .post(`/api/missions/${missionId}/complete`)
        .set(auth("rescue"))
        .send({ outcome: "DELIVERED" })
        .expect(201);

      await http
        .post(`/api/missions/${missionId}/complete`)
        .set(auth("rescue"))
        .send({ outcome: "DELIVERED" })
        .expect(400);
    });

    it("confirm khi đã qua bước (PENDING_WAREHOUSE) → 400", async () => {
      const gen = await http
        .post("/api/missions/generate-plan")
        .set(auth("admin"))
        .send({ warehouseId, incident })
        .expect(201);
      const id = gen.body.id;
      await http.post(`/api/missions/${id}/dispatch`).set(auth("admin")).expect(201);
      await http.post(`/api/missions/${id}/confirm`).set(auth("rescue")).expect(201);
      // đã ở PENDING_WAREHOUSE → confirm lại không hợp lệ
      await http.post(`/api/missions/${id}/confirm`).set(auth("rescue")).expect(400);
    });
  });

  describe("RBAC", () => {
    let missionId: string;

    beforeAll(async () => {
      const gen = await http
        .post("/api/missions/generate-plan")
        .set(auth("admin"))
        .send({ warehouseId, incident })
        .expect(201);
      missionId = gen.body.id;
    });

    it("RESCUE gọi dispatch (quyền MISSION_CREATE) → 403", async () => {
      await http.post(`/api/missions/${missionId}/dispatch`).set(auth("rescue")).expect(403);
    });

    it("WAREHOUSE gọi complete (quyền MISSION_CONFIRM) → 403", async () => {
      await http
        .post(`/api/missions/${missionId}/complete`)
        .set(auth("warehouse"))
        .send({ outcome: "DELIVERED" })
        .expect(403);
    });

    it("không token → 401", async () => {
      await http.get(`/api/missions/${missionId}`).expect(401);
    });
  });
});
