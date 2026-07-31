import { ForbiddenException } from "@nestjs/common";
import { UserRole, VirtualDeviceType, WarehouseKind } from "@prisma/client";
import { PrismaService } from "../src/prisma/prisma.service";
import { SimulationAccessService } from "../src/simulation/simulation-access.service";
import { SimulationService } from "../src/simulation/simulation.service";

describe("Confirmed simulator snapshots (E2E PostgreSQL)", () => {
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const prefix = `E2E-SNAPSHOT-${runId}`;
  let prisma: PrismaService;
  let enabled: SimulationService;
  let disabled: SimulationService;
  let organizationId: string;
  let foreignOrganizationId: string;
  let warehouseId: string;
  let deviceId: string;
  let adminId: string;
  let foreignAdminId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const [organization, foreignOrganization] = await Promise.all([
      prisma.organization.create({ data: { name: `${prefix}-org` } }),
      prisma.organization.create({ data: { name: `${prefix}-foreign-org` } }),
    ]);
    organizationId = organization.id;
    foreignOrganizationId = foreignOrganization.id;
    warehouseId = (
      await prisma.warehouse.create({
        data: {
          organizationId,
          communeId: `${prefix}-commune`,
          kind: WarehouseKind.CENTRAL,
          name: `${prefix}-warehouse`,
        },
      })
    ).id;
    deviceId = (
      await prisma.virtualDevice.create({
        data: {
          warehouseId,
          type: VirtualDeviceType.TEMPERATURE,
          code: `${prefix}-temperature`,
          unit: "°C",
        },
      })
    ).id;
    const [admin, foreignAdmin] = await Promise.all([
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
    ]);
    adminId = admin.id;
    foreignAdminId = foreignAdmin.id;
    const incidents = {
      scanWarehouse: jest.fn().mockResolvedValue({ detected: 0, incidents: [] }),
    };
    enabled = new SimulationService(
      prisma,
      incidents as never,
      new SimulationAccessService(prisma, { get: () => "true" } as never),
    );
    disabled = new SimulationService(
      prisma,
      incidents as never,
      new SimulationAccessService(prisma, { get: () => undefined } as never),
    );
  });

  afterEach(async () => {
    await prisma.sensorEvent.deleteMany({ where: { deviceId } });
    await prisma.sensorSubmission.deleteMany({ where: { warehouseId } });
  });

  afterAll(async () => {
    await prisma.sensorEvent.deleteMany({ where: { deviceId } });
    await prisma.sensorSubmission.deleteMany({ where: { warehouseId } });
    await prisma.$transaction([
      prisma.virtualDevice.deleteMany({ where: { id: deviceId } }),
      prisma.user.deleteMany({ where: { id: { in: [adminId, foreignAdminId] } } }),
      prisma.warehouse.deleteMany({ where: { id: warehouseId } }),
      prisma.organization.deleteMany({
        where: { id: { in: [organizationId, foreignOrganizationId] } },
      }),
    ]);
    await prisma.$disconnect();
  });

  it("allows only an in-scope enabled operator to create a snapshot", async () => {
    await expect(submit(disabled, adminId, "disabled")).rejects.toBeInstanceOf(ForbiddenException);
    await expect(submit(enabled, foreignAdminId, "foreign")).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(await prisma.sensorSubmission.count({ where: { warehouseId } })).toBe(0);

    await expect(submit(enabled, adminId, "accepted")).resolves.toEqual(
      expect.objectContaining({ accepted: true, duplicate: false }),
    );
    expect(await prisma.sensorSubmission.count({ where: { warehouseId } })).toBe(1);
    expect(await prisma.sensorEvent.count({ where: { deviceId } })).toBe(1);
  });

  it("replays the same confirmation idempotently without changing inventory", async () => {
    const key = `${prefix}-replay`;
    const observedAt = new Date().toISOString();
    await submit(enabled, adminId, key, observedAt);
    await expect(submit(enabled, adminId, key, observedAt)).resolves.toEqual(
      expect.objectContaining({ accepted: true, duplicate: true, events: [] }),
    );

    expect(await prisma.sensorSubmission.count({ where: { warehouseId } })).toBe(1);
    expect(await prisma.sensorEvent.count({ where: { deviceId } })).toBe(1);
  });

  function submit(
    service: SimulationService,
    userId: string,
    idempotencyKey: string,
    // Mốc đo nằm trong chữ ký chống trùng. Sinh `new Date()` mới ở mỗi lần gọi
    // sẽ tạo ra nội dung khác nhau cho cùng một khoá, nên phát lại bị từ chối là
    // đúng — muốn kiểm tra idempotency thì lần phát lại phải là cùng một lô.
    observedAt = new Date().toISOString(),
  ) {
    return service.submit(userId, {
      warehouseId,
      idempotencyKey,
      observedAt,
      readings: [{ deviceCode: `${prefix}-temperature`, value: 36 }],
    });
  }
});
