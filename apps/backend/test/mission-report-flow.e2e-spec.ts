import { INestApplication, ValidationPipe } from "@nestjs/common";
import { randomUUID } from "crypto";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";

/**
 * E2E báo cáo hiện trường qua HTTP + JWT + Postgres thật (seed sẵn).
 * Không gọi AI ở happy path: ADMIN gửi incident có cấu trúc khi phân tích báo cáo.
 */
describe("Mission report flow (E2E)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let http: ReturnType<typeof request>;
  let adminToken: string;
  let reporterToken: string;
  let reporterUserId: string;
  let reporterWarehouseId: string;
  const fixturePrefix = "E2E_REPORT_FLOW:";
  const fixtureReports = new Set<string>();

  const incidentPoint = { lat: 13.3721, lng: 108.6123 };
  const incident = {
    incidentType: "FLOOD",
    affectedPeople: 5,
    durationHours: 12,
    children: 1,
    elderly: 1,
    medicalSupportCases: 0,
  };

  async function login(email: string, password: string): Promise<string> {
    const response = await http.post("/api/auth/login").send({ email, password }).expect(201);
    return response.body.accessToken as string;
  }

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function deleteReportsByText(reportTexts: string[]) {
    if (reportTexts.length === 0) return;
    const missions = await prisma.mission.findMany({
      where: { reportText: { in: reportTexts } },
      select: { id: true },
    });
    const missionIds = missions.map((mission) => mission.id);
    if (missionIds.length === 0) return;

    await prisma.$transaction([
      prisma.notification.deleteMany({ where: { missionId: { in: missionIds } } }),
      prisma.mission.deleteMany({ where: { id: { in: missionIds } } }),
    ]);
  }

  async function cleanupFixtures() {
    const missions = await prisma.mission.findMany({
      where: { reportText: { startsWith: fixturePrefix } },
      select: { id: true, reportText: true },
    });
    const missionIds = missions.map((mission) => mission.id);
    if (missionIds.length === 0) return;

    await prisma.$transaction([
      prisma.notification.deleteMany({ where: { missionId: { in: missionIds } } }),
      prisma.mission.deleteMany({ where: { id: { in: missionIds } } }),
    ]);
  }

  async function createReport(options?: { requestId?: string; reportText?: string }) {
    const reportText =
      options?.reportText ??
      `${fixturePrefix}${randomUUID()}: Nước lũ dâng nhanh tại điểm tránh trú.`;
    fixtureReports.add(reportText);
    const response = await http
      .post("/api/missions/report")
      .set(auth(reporterToken))
      .send({
        description: reportText,
        ...(options?.requestId ? { requestId: options.requestId } : {}),
        incidentLat: incidentPoint.lat,
        incidentLng: incidentPoint.lng,
      })
      .expect(201);
    return { missionId: response.body.missionId as string, reportText };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api");
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    prisma = app.get(PrismaService);
    http = request(app.getHttpServer());
    await cleanupFixtures();

    adminToken = await login("admin", "admin123@");
    reporterToken = await login("truongthon@ungphonhanh.life", "reporter123");
    const reporter = await prisma.user.findUniqueOrThrow({
      where: { email: "truongthon@ungphonhanh.life" },
    });
    reporterUserId = reporter.id;
    reporterWarehouseId = reporter.warehouseId!;
  });

  afterEach(async () => {
    await deleteReportsByText([...fixtureReports]);
    fixtureReports.clear();
  });

  afterAll(async () => {
    if (prisma) await cleanupFixtures();
    if (app) await app.close();
  });

  it("người báo cáo gửi một report draft và ADMIN nhận đúng một notification", async () => {
    const beforeCount = await prisma.mission.count();
    const { missionId, reportText } = await createReport();

    expect(await prisma.mission.count()).toBe(beforeCount + 1);
    const draft = await prisma.mission.findUniqueOrThrow({
      where: { id: missionId },
      include: { requirements: true },
    });
    expect(draft).toMatchObject({
      id: missionId,
      warehouseId: reporterWarehouseId,
      incidentType: "OTHER",
      affectedPeople: 0,
      durationHours: 24,
      status: "DRAFT",
      reportText,
      incidentLat: incidentPoint.lat,
      incidentLng: incidentPoint.lng,
      createdByUserId: reporterUserId,
    });
    expect(draft.requirements).toHaveLength(0);

    const notifications = await prisma.notification.findMany({ where: { missionId } });
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({
      recipientRole: "ADMIN",
      kind: "INCIDENT_REPORTED",
      missionId,
      warehouseId: reporterWarehouseId,
    });

    const adminView = await http
      .get(`/api/missions/${missionId}`)
      .set(auth(adminToken))
      .expect(200);
    expect(adminView.body).toMatchObject({ id: missionId, reportText });
  });

  it("người báo cáo chỉ được report/parse/transcribe, không được điều phối mission", async () => {
    const { missionId } = await createReport();

    await http
      .post("/api/missions/parse")
      .set(auth(reporterToken))
      .send({ description: "x" })
      .expect(400);
    await http
      .post("/api/missions/transcribe")
      .set(auth(reporterToken))
      .send({ audioBase64: "x" })
      .expect(400);

    await http
      .post("/api/missions/generate-plan")
      .set(auth(reporterToken))
      .send({ warehouseId: reporterWarehouseId, incident })
      .expect(403);
    await http
      .post(`/api/missions/${missionId}/plan-from-report`)
      .set(auth(reporterToken))
      .send({ incident })
      .expect(403);
    await http.post(`/api/missions/${missionId}/approve`).set(auth(reporterToken)).expect(403);
  });

  it("ADMIN phân tích chính report draft, reset dữ liệu dẫn xuất và không tạo mission thứ hai", async () => {
    const { missionId, reportText } = await createReport();
    const beforeCount = await prisma.mission.count();
    await prisma.mission.update({
      where: { id: missionId },
      data: { actionPlan: { stale: true }, explanation: "Phương án cũ" },
    });

    const response = await http
      .post(`/api/missions/${missionId}/plan-from-report`)
      .set(auth(adminToken))
      .send({ incident })
      .expect(201);

    expect(response.body).toMatchObject({
      id: missionId,
      status: "DRAFT",
      reportText,
      incidentType: incident.incidentType,
      affectedPeople: incident.affectedPeople,
      durationHours: incident.durationHours,
      incidentLat: incidentPoint.lat,
      incidentLng: incidentPoint.lng,
      actionPlan: null,
      explanation: null,
    });
    expect(response.body.requirements.length).toBeGreaterThan(0);
    expect(await prisma.mission.count()).toBe(beforeCount);

    const planned = await prisma.mission.findUniqueOrThrow({
      where: { id: missionId },
      include: { requirements: true },
    });
    expect(planned.reportText).toBe(reportText);
    expect(planned.incidentLat).toBe(incidentPoint.lat);
    expect(planned.incidentLng).toBe(incidentPoint.lng);
    expect(planned.requirements.length).toBeGreaterThan(0);
    expect(planned.actionPlan).toBeNull();
    expect(planned.explanation).toBeNull();

    // Xã phát hành phương án thẳng tới kho: DRAFT → PENDING_WAREHOUSE.
    const approved = await http
      .post(`/api/missions/${missionId}/approve`)
      .set(auth(adminToken))
      .expect(201);
    expect(approved.body.status).toBe("PENDING_WAREHOUSE");

    await http
      .post(`/api/missions/${missionId}/plan-from-report`)
      .set(auth(adminToken))
      .send({ incident })
      .expect(400);
  });

  it("không phát hành được report thô chưa có phương án", async () => {
    const { missionId } = await createReport();

    await http.post(`/api/missions/${missionId}/approve`).set(auth(adminToken)).expect(400);
    await expect(
      prisma.mission.findUniqueOrThrow({ where: { id: missionId } }),
    ).resolves.toMatchObject({ status: "DRAFT" });
  });

  it("retry tuần tự cùng requestId trả cùng mission và không nhân notification", async () => {
    const requestId = `sequential-${randomUUID()}`;
    const reportText = `${fixturePrefix}${requestId}: retry tuần tự.`;
    fixtureReports.add(reportText);
    const payload = {
      description: reportText,
      requestId,
      incidentLat: incidentPoint.lat,
      incidentLng: incidentPoint.lng,
    };

    const first = await http
      .post("/api/missions/report")
      .set(auth(reporterToken))
      .send(payload)
      .expect(201);
    const second = await http
      .post("/api/missions/report")
      .set(auth(reporterToken))
      .send(payload)
      .expect(201);

    expect(second.body.missionId).toBe(first.body.missionId);
    expect(
      await prisma.mission.count({
        where: { createdByUserId: reporterUserId, reportRequestId: requestId },
      }),
    ).toBe(1);
    expect(await prisma.notification.count({ where: { missionId: first.body.missionId } })).toBe(1);
  });

  it("retry đồng thời cùng requestId chỉ tạo một mission và một notification", async () => {
    const requestId = `concurrent-${randomUUID()}`;
    const reportText = `${fixturePrefix}${requestId}: retry đồng thời.`;
    fixtureReports.add(reportText);
    const payload = {
      description: reportText,
      requestId,
      incidentLat: incidentPoint.lat,
      incidentLng: incidentPoint.lng,
    };

    const responses = await Promise.all([
      http.post("/api/missions/report").set(auth(reporterToken)).send(payload),
      http.post("/api/missions/report").set(auth(reporterToken)).send(payload),
    ]);

    expect(responses.map((response) => response.status)).toEqual([201, 201]);
    expect(responses[0].body.missionId).toBe(responses[1].body.missionId);
    expect(
      await prisma.mission.count({
        where: { createdByUserId: reporterUserId, reportRequestId: requestId },
      }),
    ).toBe(1);
    expect(
      await prisma.notification.count({ where: { missionId: responses[0].body.missionId } }),
    ).toBe(1);
  });

  it("chặn report có tọa độ ngoài miền hoặc thiếu nửa cặp", async () => {
    const base = { description: `${fixturePrefix}${randomUUID()}: payload sai.` };
    await http
      .post("/api/missions/report")
      .set(auth(reporterToken))
      .send({ ...base, incidentLat: 91, incidentLng: 108 })
      .expect(400);
    await http
      .post("/api/missions/report")
      .set(auth(reporterToken))
      .send({ ...base, incidentLat: 13 })
      .expect(400);
  });
});
