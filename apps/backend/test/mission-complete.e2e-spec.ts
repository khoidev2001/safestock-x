import { INestApplication, ValidationPipe } from "@nestjs/common";
import { MissionStatus, Prisma, UserRole, WarehouseKind } from "@prisma/client";
import { Test } from "@nestjs/testing";
import * as bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";

/**
 * Bước đóng nhiệm vụ (READY → COMPLETED) trên PostgreSQL thật.
 *
 * Xã phát hành phương án thẳng tới kho, nên bộ test này dựng thẳng nhiệm vụ ở
 * trạng thái READY thay vì đi lại toàn bộ luồng chuẩn bị theo từng SKU: thứ cần
 * khoá ở đây là ai được đóng nhiệm vụ và kho biến động thế nào theo từng kết quả.
 */
describe("Mission complete (E2E PostgreSQL)", () => {
  const runId = `${Date.now()}-${randomUUID()}`;
  const prefix = `E2E-COMPLETE-${runId}`;
  const initialQuantity = 40;
  const allocated = 7;

  let app: INestApplication;
  let prisma: PrismaService;
  let http: ReturnType<typeof request>;
  let warehouseId: string;
  let itemId: string;
  let shelfId: string;
  let organizationId: string;
  let rescueToken: string;
  let warehouseToken: string;
  const missionIds: string[] = [];
  const batchIds: string[] = [];

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
    const organization = await prisma.organization.create({ data: { name: `${prefix}-org` } });
    organizationId = organization.id;
    const warehouse = await prisma.warehouse.create({
      data: {
        organizationId,
        name: `${prefix}-warehouse`,
        kind: WarehouseKind.CENTRAL,
        communeId: `${prefix}-commune`,
      },
    });
    warehouseId = warehouse.id;
    const zone = await prisma.warehouseZone.create({
      data: { warehouseId, code: `${prefix}-Z`, name: `${prefix} zone` },
    });
    const shelf = await prisma.shelf.create({ data: { zoneId: zone.id, code: `${prefix}-S` } });
    shelfId = shelf.id;
    const category = await prisma.itemCategory.create({
      data: { name: `${prefix}-cat`, unit: "gói" },
    });
    const item = await prisma.item.create({
      data: {
        categoryId: category.id,
        name: `${prefix} vật tư`,
        sku: `${prefix}-SKU`,
        consumable: true,
      },
    });
    itemId = item.id;

    await prisma.user.createMany({
      data: [
        {
          organizationId,
          email: `${prefix}-rescue@example.test`,
          passwordHash,
          fullName: "Hiện trường E2E complete",
          role: UserRole.RESCUE,
        },
        {
          organizationId,
          email: `${prefix}-warehouse@example.test`,
          passwordHash,
          fullName: "Kho E2E complete",
          role: UserRole.WAREHOUSE,
          warehouseId,
        },
      ],
    });
    rescueToken = await login(`${prefix}-rescue@example.test`, password);
    warehouseToken = await login(`${prefix}-warehouse@example.test`, password);
  });

  afterAll(async () => {
    if (missionIds.length > 0) {
      await prisma.missionRequirement.deleteMany({ where: { missionId: { in: missionIds } } });
      await prisma.mission.deleteMany({ where: { id: { in: missionIds } } });
    }
    if (batchIds.length > 0) {
      await prisma.inventoryTransaction.deleteMany({ where: { batchId: { in: batchIds } } });
      await prisma.itemBatch.deleteMany({ where: { id: { in: batchIds } } });
    }
    await prisma.user.deleteMany({ where: { organizationId } });
    await prisma.item.deleteMany({ where: { id: itemId } });
    await prisma.shelf.deleteMany({ where: { id: shelfId } });
    await prisma.warehouseZone.deleteMany({ where: { warehouseId } });
    await prisma.warehouse.deleteMany({ where: { id: warehouseId } });
    await prisma.organization.deleteMany({ where: { id: organizationId } });
    await app.close();
  });

  async function login(email: string, password: string): Promise<string> {
    const res = await http.post("/api/auth/login").send({ email, password }).expect(201);
    return res.body.accessToken as string;
  }

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  /** Nhiệm vụ đã ở READY: kho xuất xong, vật tư đang trên đường đi. */
  async function createReadyMission(): Promise<{ missionId: string; batchId: string }> {
    const batch = await prisma.itemBatch.create({
      data: {
        itemId,
        shelfId,
        batchCode: `${prefix}-${randomUUID()}`,
        quantity: initialQuantity - allocated, // kho đã trừ khi chuẩn bị
      },
    });
    batchIds.push(batch.id);
    const mission = await prisma.mission.create({
      data: {
        warehouseId,
        incidentType: "FLOOD",
        affectedPeople: 20,
        durationHours: 24,
        priority: "MEDIUM",
        status: MissionStatus.READY,
        fulfillment: 100,
        incidentLat: 13.3833,
        incidentLng: 108.9,
        parsedInput: {} as Prisma.InputJsonValue,
        requirements: {
          create: {
            sku: `${prefix}-SKU`,
            itemName: `${prefix} vật tư`,
            required: allocated,
            allocated,
            shortage: 0,
            unit: "gói",
            allocations: [{ batchId: batch.id, qty: allocated }] as Prisma.InputJsonValue,
          },
        },
      },
    });
    missionIds.push(mission.id);
    return { missionId: mission.id, batchId: batch.id };
  }

  const stockOf = async (batchId: string): Promise<number> =>
    (await prisma.itemBatch.findUniqueOrThrow({ where: { id: batchId } })).quantity;

  it("giao đủ thì đóng nhiệm vụ và KHÔNG trả vật tư về kho", async () => {
    const { missionId, batchId } = await createReadyMission();

    await http
      .post(`/api/missions/${missionId}/complete`)
      .set(auth(rescueToken))
      .send({ outcome: "DELIVERED", note: "Giao tại điểm tập kết" })
      .expect(201);

    const mission = await prisma.mission.findUniqueOrThrow({ where: { id: missionId } });
    expect(mission.status).toBe(MissionStatus.COMPLETED);
    expect(await stockOf(batchId)).toBe(initialQuantity - allocated);
  });

  it("không giao được thì vật tư hoàn về kho", async () => {
    // Hàng không tới nơi mà vẫn nằm ngoài sổ sách là mất mát trên giấy tờ.
    const { missionId, batchId } = await createReadyMission();

    await http
      .post(`/api/missions/${missionId}/complete`)
      .set(auth(rescueToken))
      .send({ outcome: "FAILED", note: "Đường ngập sâu" })
      .expect(201);

    expect(await stockOf(batchId)).toBe(initialQuantity);
  });

  it("giao một phần thì KHÔNG tự đụng kho, chờ đối soát tay", async () => {
    // Máy không đoán được phần nào đã giao, phần nào mang về.
    const { missionId, batchId } = await createReadyMission();

    await http
      .post(`/api/missions/${missionId}/complete`)
      .set(auth(rescueToken))
      .send({ outcome: "PARTIAL", note: "Giao được khoảng 60%" })
      .expect(201);

    expect(await stockOf(batchId)).toBe(initialQuantity - allocated);
  });

  it("bấm báo kết quả lần thứ hai không hoàn kho thêm lần nữa", async () => {
    const { missionId, batchId } = await createReadyMission();

    await http
      .post(`/api/missions/${missionId}/complete`)
      .set(auth(rescueToken))
      .send({ outcome: "FAILED" })
      .expect(201);
    await http
      .post(`/api/missions/${missionId}/complete`)
      .set(auth(rescueToken))
      .send({ outcome: "FAILED" })
      .expect(400);

    expect(await stockOf(batchId)).toBe(initialQuantity);
  });

  it("người giữ kho không tự báo thay người đi giao", async () => {
    const { missionId } = await createReadyMission();

    await http
      .post(`/api/missions/${missionId}/complete`)
      .set(auth(warehouseToken))
      .send({ outcome: "DELIVERED" })
      .expect(403);
  });

  it("không token thì không đóng được nhiệm vụ", async () => {
    const { missionId } = await createReadyMission();

    await http
      .post(`/api/missions/${missionId}/complete`)
      .send({ outcome: "DELIVERED" })
      .expect(401);
  });

  it("kết quả giao ngoài ba giá trị hợp lệ bị từ chối", async () => {
    const { missionId } = await createReadyMission();

    await http
      .post(`/api/missions/${missionId}/complete`)
      .set(auth(rescueToken))
      .send({ outcome: "KHONG_BIET" })
      .expect(400);
  });
});
