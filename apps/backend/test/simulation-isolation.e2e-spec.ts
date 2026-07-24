import { ForbiddenException } from "@nestjs/common";
import { TransactionSource, UserRole, VirtualDeviceType } from "@prisma/client";
import { InventoryService } from "../src/inventory/inventory.service";
import { PrismaService } from "../src/prisma/prisma.service";
import { SimulationAccessService } from "../src/simulation/simulation-access.service";
import { SimulationService } from "../src/simulation/simulation.service";
import { SimulationSystemActorService } from "../src/simulation/simulation-system-actor.service";

describe("Simulator isolation (E2E PostgreSQL)", () => {
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const prefix = `E2E-SIM-${runId}`;
  let prisma: PrismaService;
  let enabledService: SimulationService;
  let disabledService: SimulationService;
  let organizationId: string;
  let foreignOrganizationId: string;
  let warehouseId: string;
  let foreignWarehouseId: string;
  let zoneId: string;
  let shelfId: string;
  let itemId: string;
  let categoryId: string;
  let batchId: string;
  let deviceId: string;
  let adminId: string;
  let warehouseUserId: string;
  let foreignAdminId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const organization = await prisma.organization.create({ data: { name: `${prefix}-org` } });
    organizationId = organization.id;
    const foreignOrganization = await prisma.organization.create({
      data: { name: `${prefix}-foreign-org` },
    });
    foreignOrganizationId = foreignOrganization.id;
    warehouseId = (
      await prisma.warehouse.create({
        data: { organizationId, communeId: `${prefix}-commune`, name: `${prefix}-warehouse` },
      })
    ).id;
    foreignWarehouseId = (
      await prisma.warehouse.create({
        data: {
          organizationId: foreignOrganizationId,
          communeId: `${prefix}-foreign-commune`,
          name: `${prefix}-foreign-warehouse`,
        },
      })
    ).id;
    zoneId = (
      await prisma.warehouseZone.create({
        data: { warehouseId, code: `${prefix}-Z`, name: `${prefix}-zone` },
      })
    ).id;
    shelfId = (await prisma.shelf.create({ data: { zoneId, code: `${prefix}-S` } })).id;
    categoryId = (
      await prisma.itemCategory.create({ data: { name: `${prefix}-category`, unit: "unit" } })
    ).id;
    itemId = (
      await prisma.item.create({
        data: {
          categoryId,
          name: `${prefix}-item`,
          sku: `${prefix}-SKU`,
          unitWeightKg: 1,
        },
      })
    ).id;
    batchId = (
      await prisma.itemBatch.create({
        data: { itemId, shelfId, batchCode: `${prefix}-batch`, quantity: 10 },
      })
    ).id;
    deviceId = (
      await prisma.virtualDevice.create({
        data: {
          warehouseId,
          zoneId,
          shelfId,
          type: VirtualDeviceType.LOADCELL,
          code: `${prefix}-loadcell`,
          unit: "kg",
          currentValue: 10,
        },
      })
    ).id;
    const [admin, warehouseUser, foreignAdmin] = await Promise.all([
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
          organizationId,
          warehouseId,
          email: `${prefix}-warehouse@example.test`,
          passwordHash: "unused",
          fullName: `${prefix} warehouse`,
          role: UserRole.WAREHOUSE,
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
    warehouseUserId = warehouseUser.id;
    foreignAdminId = foreignAdmin.id;

    const readiness = { recalculateWarehouse: jest.fn().mockResolvedValue(undefined) };
    const inventory = new InventoryService(prisma, readiness as never);
    const systemActors = new SimulationSystemActorService(prisma);
    const incidents = { scanWarehouse: jest.fn().mockResolvedValue({ detected: 0 }) };
    enabledService = new SimulationService(
      prisma,
      readiness as never,
      inventory,
      incidents as never,
      new SimulationAccessService(prisma, { get: () => "true" } as never),
      systemActors,
    );
    disabledService = new SimulationService(
      prisma,
      readiness as never,
      inventory,
      incidents as never,
      new SimulationAccessService(prisma, { get: () => undefined } as never),
      systemActors,
    );
  });

  afterEach(async () => {
    enabledService.onModuleDestroy();
    disabledService.onModuleDestroy();
    await resetOperationalFixture();
  });

  afterAll(async () => {
    await resetOperationalFixture();
    const systemActors = await prisma.user.findMany({
      where: { email: { startsWith: `system-loadcell+${warehouseId}@` } },
      select: { id: true },
    });
    await prisma.$transaction([
      prisma.user.deleteMany({
        where: {
          id: { in: [adminId, warehouseUserId, foreignAdminId, ...systemActors.map((x) => x.id)] },
        },
      }),
      prisma.virtualDevice.deleteMany({ where: { id: deviceId } }),
      prisma.itemBatch.deleteMany({ where: { id: batchId } }),
      prisma.shelf.deleteMany({ where: { id: shelfId } }),
      prisma.warehouseZone.deleteMany({ where: { id: zoneId } }),
      prisma.item.deleteMany({ where: { id: itemId } }),
      prisma.itemCategory.deleteMany({ where: { id: categoryId } }),
      prisma.warehouse.deleteMany({ where: { id: { in: [warehouseId, foreignWarehouseId] } } }),
      prisma.organization.deleteMany({
        where: { id: { in: [organizationId, foreignOrganizationId] } },
      }),
    ]);
    await prisma.$disconnect();
  });

  it("disabled flag and non-admin actor produce zero writes", async () => {
    await expect(emit(disabledService, adminId, 8)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(emit(enabledService, warehouseUserId, 8)).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    await expectOperationalState({ quantity: 10, currentValue: 10, events: 0, transactions: 0 });
  });

  it("foreign organization ADMIN cannot mutate target warehouse", async () => {
    await expect(emit(enabledService, foreignAdminId, 8)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expectOperationalState({ quantity: 10, currentValue: 10, events: 0, transactions: 0 });
  });

  it("commits loadcell inventory, device and event atomically with reserved actor", async () => {
    await emit(enabledService, adminId, 8);

    await expectOperationalState({ quantity: 8, currentValue: 8, events: 1, transactions: 1 });
    const transaction = await prisma.inventoryTransaction.findFirstOrThrow({
      where: { batchId, source: TransactionSource.LOADCELL },
      include: { user: true },
    });
    expect(transaction.userId).not.toBe(adminId);
    expect(transaction.user.email).toBe(`system-loadcell+${warehouseId}@local.invalid`);
    expect(transaction.user.warehouseId).toBe(warehouseId);
    expect(transaction.user.organizationId).toBe(organizationId);
    expect(
      await prisma.auditLog.count({
        where: { actorId: transaction.userId, entityId: batchId, action: "INVENTORY_EXPORT" },
      }),
    ).toBe(1);
  });

  it("rolls back inventory and device baseline when event persistence fails", async () => {
    await expect(
      enabledService.emit(adminId, {
        warehouseId,
        deviceCode: `${prefix}-loadcell`,
        eventType: undefined as never,
        value: 8,
      }),
    ).rejects.toBeDefined();

    await expectOperationalState({ quantity: 10, currentValue: 10, events: 0, transactions: 0 });
    expect(await prisma.auditLog.count({ where: { entityId: batchId } })).toBe(0);
  });

  function emit(service: SimulationService, userId: string, value: number) {
    return service.emit(userId, {
      warehouseId,
      deviceCode: `${prefix}-loadcell`,
      eventType: "WEIGHT_READING",
      value,
    });
  }

  async function expectOperationalState(expected: {
    quantity: number;
    currentValue: number;
    events: number;
    transactions: number;
  }) {
    expect((await prisma.itemBatch.findUniqueOrThrow({ where: { id: batchId } })).quantity).toBe(
      expected.quantity,
    );
    expect(
      (await prisma.virtualDevice.findUniqueOrThrow({ where: { id: deviceId } })).currentValue,
    ).toBe(expected.currentValue);
    expect(await prisma.sensorEvent.count({ where: { deviceId } })).toBe(expected.events);
    expect(await prisma.inventoryTransaction.count({ where: { batchId } })).toBe(
      expected.transactions,
    );
  }

  async function resetOperationalFixture() {
    const transactions = await prisma.inventoryTransaction.findMany({
      where: { batchId },
      select: { id: true },
    });
    await prisma.$transaction([
      prisma.sensorEvent.deleteMany({ where: { deviceId } }),
      prisma.auditLog.deleteMany({ where: { entityId: batchId } }),
      prisma.inventoryTransaction.deleteMany({
        where: { id: { in: transactions.map((x) => x.id) } },
      }),
      prisma.itemBatch.update({ where: { id: batchId }, data: { quantity: 10 } }),
      prisma.virtualDevice.update({ where: { id: deviceId }, data: { currentValue: 10 } }),
    ]);
  }
});
