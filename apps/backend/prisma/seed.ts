import { config } from "dotenv";
const explicitEnvFile = process.env.SAFESTOCK_ENV_FILE?.trim();
config(explicitEnvFile ? { path: explicitEnvFile } : undefined);

import {
  ItemCondition,
  ItemStatus,
  PrismaClient,
  type Warehouse,
  type WarehouseZone,
  type Shelf,
  UserRole,
} from "@prisma/client";
import { loadHamletCulturalHouseLocations } from "./hamlet-location-data";
import * as bcrypt from "bcryptjs";
import {
  CENTRAL_BATCHES,
  CENTRAL_SHELVES,
  HAMLET_WAREHOUSES,
  STANDARD_ITEMS,
  type SeedBatchDefinition,
  validateSeedDataset,
} from "./seed-data";
import {
  type SeedBatchRef,
  dateFromOffset,
  seedDevices,
  seedOperationalRecords,
  seedTransactionHistory,
} from "./seed-support";

const prisma = new PrismaClient();
const COMMUNE_ID = "dong-xuan";
export const REPORTER_PASSWORD_ENV = "SAFESTOCK_REPORTER_PASSWORD";
export const WAREHOUSE_PASSWORD_ENV = "SAFESTOCK_HAMLET_WAREHOUSE_PASSWORD";
export const ADMIN_PASSWORD_ENV = "SAFESTOCK_ADMIN_PASSWORD";
export const CENTRAL_WAREHOUSE_PASSWORD_ENV = "SAFESTOCK_CENTRAL_WAREHOUSE_PASSWORD";
export const RESCUE_PASSWORD_ENV = "SAFESTOCK_RESCUE_PASSWORD";
export const SEED_RESET_CONFIRMATION = "--confirm-demo-reset";

export function assertSeedResetConfirmed(args: string[] = process.argv.slice(2)): void {
  if (args.length !== 1 || args[0] !== SEED_RESET_CONFIRMATION) {
    throw new Error(
      `Seed bị từ chối: cần truyền chính xác ${SEED_RESET_CONFIRMATION} sau khi xác nhận database demo có thể bị reset`,
    );
  }
}

export function getRequiredSecret(
  name: string,
  environment: NodeJS.ProcessEnv = process.env,
): string {
  const value = environment[name];
  if (!value || value.trim() === "") {
    throw new Error(`${name} phải được cung cấp qua biến môi trường`);
  }
  return value;
}

export function reporterLoginForLocationKey(locationKey: string): string {
  return `${normalizeLocationKey(locationKey)}_baocao`;
}

export function warehouseLoginForLocationKey(locationKey: string): string {
  return `kho${normalizeLocationKey(locationKey)}`;
}

export function buildSeededReporterInput(params: {
  organizationId: string;
  warehouseId: string;
  warehouseName: string;
  locationKey: string;
  passwordHash: string;
}) {
  return {
    organizationId: params.organizationId,
    email: reporterLoginForLocationKey(params.locationKey),
    passwordHash: params.passwordHash,
    fullName: `Trưởng thôn ${params.warehouseName.replace("Kho ", "")}`,
    role: UserRole.REPORTER,
    warehouseId: params.warehouseId,
  };
}

export function buildSeededHamletLeaderInput(params: {
  organizationId: string;
  warehouseId: string;
  warehouseName: string;
  locationKey: string;
  passwordHash: string;
}) {
  return {
    organizationId: params.organizationId,
    email: warehouseLoginForLocationKey(params.locationKey),
    passwordHash: params.passwordHash,
    fullName: `Trưởng ${params.warehouseName.replace("Kho ", "")}`,
    role: UserRole.WAREHOUSE,
    warehouseId: params.warehouseId,
  };
}

export function requireReportingHamlet(warehouses: Warehouse[]): Warehouse {
  const warehouse = warehouses[0];
  if (!warehouse) {
    throw new Error("Không thể tạo REPORTER khi không có kho thôn");
  }
  return warehouse;
}

function normalizeLocationKey(locationKey: string): string {
  const normalized = locationKey.trim().toLowerCase().replace(/-/g, "");
  if (!/^[a-z0-9]+$/.test(normalized)) throw new Error("locationKey kho thôn không hợp lệ");
  return normalized;
}

async function resetDatabase() {
  await prisma.incidentAction.deleteMany();
  await prisma.incidentEvidence.deleteMany();
  await prisma.incident.deleteMany();
  await prisma.missionWarehouseRequest.deleteMany();
  await prisma.missionRequirement.deleteMany();
  await prisma.missionAudio.deleteMany();
  await prisma.mission.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.monthlyStockReport.deleteMany();
  await prisma.inventoryTransaction.deleteMany();
  await prisma.inventoryCount.deleteMany();
  await prisma.loanRecord.deleteMany();
  await prisma.sensorEvent.deleteMany();
  await prisma.simulationRun.deleteMany();
  await prisma.simulationScenario.deleteMany();
  await prisma.virtualDevice.deleteMany();
  await prisma.readinessRecommendation.deleteMany();
  await prisma.readinessComponent.deleteMany();
  await prisma.readinessScore.deleteMany();
  await prisma.readinessThreshold.deleteMany();
  await prisma.readinessRule.deleteMany();
  await prisma.itemBatch.deleteMany();
  await prisma.item.deleteMany();
  await prisma.itemCategory.deleteMany();
  await prisma.shelf.deleteMany();
  await prisma.warehouseZone.deleteMany();
  await prisma.neighborWarehouse.deleteMany();
  await prisma.apiUsage.deleteMany();
  await prisma.warehouse.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();
}

async function main() {
  assertSeedResetConfirmed();

  const validationErrors = validateSeedDataset();
  if (validationErrors.length > 0) {
    throw new Error(`Bộ dữ liệu seed không hợp lệ:\n- ${validationErrors.join("\n- ")}`);
  }
  if (HAMLET_WAREHOUSES.length === 0) {
    throw new Error("Bộ dữ liệu seed phải có ít nhất một kho thôn cho REPORTER");
  }

  const reporterPassword = requiredSecret(REPORTER_PASSWORD_ENV);
  const hamletWarehousePassword = requiredSecret(WAREHOUSE_PASSWORD_ENV);
  const adminPassword = requiredSecret(ADMIN_PASSWORD_ENV);
  const centralWarehousePassword = requiredSecret(CENTRAL_WAREHOUSE_PASSWORD_ENV);
  const rescuePassword = requiredSecret(RESCUE_PASSWORD_ENV);
  await resetDatabase();

  const organization = await prisma.organization.create({
    data: { name: "Hội Chữ thập đỏ xã Đồng Xuân" },
  });
  const password = (plain: string) => bcrypt.hashSync(plain, 10);
  await prisma.user.createMany({
    data: [
      {
        organizationId: organization.id,
        email: "admin",
        passwordHash: password(adminPassword),
        fullName: "Quản trị hệ thống",
        role: "ADMIN",
      },
      {
        organizationId: organization.id,
        email: "staff@safestock.vn",
        passwordHash: password(centralWarehousePassword),
        fullName: "Phụ trách kho trung tâm",
        role: "WAREHOUSE",
      },
      {
        organizationId: organization.id,
        email: "rescue@safestock.vn",
        passwordHash: password(rescuePassword),
        fullName: "Đội cứu hộ Đồng Xuân",
        role: "RESCUE",
      },
    ],
  });

  const centralWarehouse = await prisma.warehouse.create({
    data: {
      organizationId: organization.id,
      name: "Kho cứu trợ trung tâm Đồng Xuân",
      location: "68 Trần Phú, thôn Long Châu, xã Đồng Xuân, tỉnh Đắk Lắk",
      kind: "CENTRAL",
      communeId: COMMUNE_ID,
      lat: 13.3667,
      lng: 109.0333,
    },
  });
  const warehouseUser = await prisma.user.update({
    where: { email: "staff@safestock.vn" },
    data: { warehouseId: centralWarehouse.id },
  });
  const rescueUser = await prisma.user.findUniqueOrThrow({
    where: { email: "rescue@safestock.vn" },
  });

  const { zones, shelves } = await createCentralStorage(centralWarehouse.id);
  const itemBySku = await createCatalog();
  const centralBatchRefs = await createCentralBatches(centralWarehouse.id, itemBySku, shelves);
  const { warehouses: hamletWarehouses, batchRefs: hamletBatchRefs } = await createHamletWarehouses(
    organization.id,
    itemBySku,
  );
  const hamletLeaderIds = await createHamletLeaders(
    organization.id,
    hamletWarehouses,
    password(hamletWarehousePassword),
  );

  await createHamletReporters(organization.id, hamletWarehouses, password(reporterPassword));

  const deviceByCode = await seedDevices(prisma, {
    centralWarehouse,
    centralZones: zones,
    centralShelves: shelves,
    hamletWarehouses,
  });
  await seedOperationalRecords(prisma, {
    centralWarehouse,
    centralBatchRefs,
    hamletBatchRefs,
    hamletWarehouses,
    hamletLeaderIds,
    warehouseUserId: warehouseUser.id,
    rescueUserId: rescueUser.id,
    deviceByCode,
  });
  await seedNeighbors(centralWarehouse.id);

  const primaryBatchBySku = new Map<string, SeedBatchRef>();
  for (const ref of centralBatchRefs) {
    if (!primaryBatchBySku.has(ref.sku) && ref.definition.condition === "NEW") {
      primaryBatchBySku.set(ref.sku, ref);
    }
  }
  const transactionCount = await seedTransactionHistory(
    prisma,
    warehouseUser.id,
    primaryBatchBySku,
  );

  await prisma.auditLog.create({
    data: {
      actorId: warehouseUser.id,
      action: "SEED_STANDARD_DATASET",
      entity: "Organization",
      entityId: organization.id,
      metadata: {
        communeId: COMMUNE_ID,
        hamletCount: HAMLET_WAREHOUSES.length,
        catalogVersion: "2026.07",
      },
    },
  });

  console.log("Seed xong:", {
    organizations: await prisma.organization.count(),
    users: await prisma.user.count(),
    warehouses: await prisma.warehouse.count(),
    hamlets: await prisma.warehouse.count({ where: { kind: "HAMLET" } }),
    items: await prisma.item.count(),
    batches: await prisma.itemBatch.count(),
    inventoryCounts: await prisma.inventoryCount.count(),
    openLoans: await prisma.loanRecord.count({ where: { status: "ON_LOAN" } }),
    devices: await prisma.virtualDevice.count(),
    incidents: await prisma.incident.count(),
    transactions: transactionCount,
  });
}

async function createCentralStorage(warehouseId: string) {
  const zoneDefinitions = [
    { code: "A", name: "Nước sạch và lương thực" },
    { code: "B", name: "Cứu sinh và che chắn" },
    { code: "C", name: "Y tế, điện và liên lạc" },
  ];
  const zones = new Map<string, WarehouseZone>();
  for (const definition of zoneDefinitions) {
    const zone = await prisma.warehouseZone.create({
      data: { warehouseId, ...definition },
    });
    zones.set(zone.code, zone);
  }

  const shelves = new Map<string, Shelf>();
  for (const definition of CENTRAL_SHELVES) {
    const zone = zones.get(definition.zoneCode);
    if (!zone) throw new Error(`Không tìm thấy khu ${definition.zoneCode}`);
    const shelf = await prisma.shelf.create({
      data: {
        zoneId: zone.id,
        code: definition.code,
        isLocked: definition.isLocked ?? false,
      },
    });
    shelves.set(shelf.code, shelf);
  }
  return { zones, shelves };
}

async function createCatalog() {
  const categoryByName = new Map<string, string>();
  const itemBySku = new Map<string, string>();
  for (const definition of STANDARD_ITEMS) {
    let categoryId = categoryByName.get(definition.category);
    if (!categoryId) {
      const category = await prisma.itemCategory.create({
        data: { name: definition.category, unit: definition.unit },
      });
      categoryId = category.id;
      categoryByName.set(definition.category, category.id);
    }
    const item = await prisma.item.create({
      data: {
        categoryId,
        name: definition.name,
        sku: definition.sku,
        consumable: definition.consumable,
        unitWeightKg: definition.unitWeightKg,
      },
    });
    itemBySku.set(item.sku, item.id);
  }
  return itemBySku;
}

async function createCentralBatches(
  warehouseId: string,
  itemBySku: Map<string, string>,
  shelves: Map<string, Shelf>,
) {
  const refs: SeedBatchRef[] = [];
  for (const definition of CENTRAL_BATCHES) {
    const itemId = itemBySku.get(definition.sku);
    const shelf = shelves.get(definition.shelfCode);
    if (!itemId || !shelf) throw new Error(`Không thể tạo lô ${definition.batchCode}`);
    const batch = await prisma.itemBatch.create({
      data: {
        itemId,
        shelfId: shelf.id,
        batchCode: definition.batchCode,
        quantity: definition.quantity,
        status: legacyStatus(definition),
        condition: definition.condition,
        circulation: definition.circulation ?? "IN_STOCK",
        expiryDate: dateFromOffset(definition.expiryOffsetDays),
        inspectedAt: dateFromOffset(
          definition.inspectedOffsetDays == null ? null : -definition.inspectedOffsetDays,
        ),
      },
    });
    refs.push({
      warehouseId,
      sku: definition.sku,
      batchId: batch.id,
      quantity: definition.quantity,
      definition,
    });
  }
  return refs;
}

async function createHamletWarehouses(organizationId: string, itemBySku: Map<string, string>) {
  const warehouses: Warehouse[] = [];
  const batchRefs: SeedBatchRef[] = [];
  const culturalHouseByKey = new Map(
    loadHamletCulturalHouseLocations().locations.map((location) => [location.key, location]),
  );
  for (let index = 0; index < HAMLET_WAREHOUSES.length; index++) {
    const definition = HAMLET_WAREHOUSES[index];
    const culturalHouse = culturalHouseByKey.get(definition.key);
    const approved = culturalHouse?.reviewStatus === "APPROVED" ? culturalHouse : null;
    const warehouse = await prisma.warehouse.create({
      data: {
        organizationId,
        name: definition.name,
        location: `${definition.name.replace("Kho ", "")}, xã Đồng Xuân, tỉnh Đắk Lắk`,
        kind: "HAMLET",
        communeId: COMMUNE_ID,
        lat: approved?.lat ?? null,
        lng: approved?.lng ?? null,
        locationKey: definition.key,
        locationMethod: approved?.method,
        locationSourceName: approved?.sourceName,
        locationSourceUrl: approved?.sourceUrl,
        locationSourceRef: approved?.sourceRef,
        locationCheckedAt: approved ? new Date(approved.checkedAt) : null,
        locationMethodNote: approved?.methodNote,
        locationUpdatedAt: approved ? new Date(approved.checkedAt) : null,
      },
    });
    warehouses.push(warehouse);
    const zone = await prisma.warehouseZone.create({
      data: { warehouseId: warehouse.id, code: "A", name: "Điểm vật tư thôn" },
    });
    const shelf = await prisma.shelf.create({
      data: { zoneId: zone.id, code: "A1" },
    });

    for (const stock of definition.stock) {
      const itemId = itemBySku.get(stock.sku);
      if (!itemId) throw new Error(`${definition.name} dùng SKU không tồn tại: ${stock.sku}`);
      const batch = await prisma.itemBatch.create({
        data: {
          itemId,
          shelfId: shelf.id,
          batchCode: `${stock.sku}-${definition.key.toUpperCase()}`,
          quantity: stock.quantity,
          status: ItemStatus.AVAILABLE,
          condition: ItemCondition.NEW,
          expiryDate: dateFromOffset(stock.expiryOffsetDays),
          inspectedAt: dateFromOffset(-(2 + (index % 6))),
        },
      });
      batchRefs.push({
        warehouseId: warehouse.id,
        sku: stock.sku,
        batchId: batch.id,
        quantity: stock.quantity,
        definition: {
          sku: stock.sku,
          batchCode: batch.batchCode,
          shelfCode: "A1",
          quantity: stock.quantity,
          condition: "NEW",
          expiryOffsetDays: stock.expiryOffsetDays,
          inspectedOffsetDays: 2 + (index % 6),
          countedOffsetDays: 2 + (index % 6),
        },
      });
    }
  }
  return { warehouses, batchRefs };
}

async function createHamletLeaders(
  organizationId: string,
  warehouses: Warehouse[],
  passwordHash: string,
) {
  const leaderIds = new Map<string, string>();
  for (let index = 0; index < warehouses.length; index++) {
    const warehouse = warehouses[index];
    const user = await prisma.user.create({
      data: buildSeededHamletLeaderInput({
        organizationId,
        warehouseId: warehouse.id,
        warehouseName: warehouse.name,
        locationKey: requiredWarehouseLocationKey(warehouse),
        passwordHash,
      }),
    });
    leaderIds.set(warehouse.id, user.id);
  }
  return leaderIds;
}

async function createHamletReporters(
  organizationId: string,
  warehouses: Warehouse[],
  passwordHash: string,
) {
  for (const warehouse of warehouses) {
    await prisma.user.create({
      data: buildSeededReporterInput({
        organizationId,
        warehouseId: warehouse.id,
        warehouseName: warehouse.name,
        locationKey: requiredWarehouseLocationKey(warehouse),
        passwordHash,
      }),
    });
  }
}

function requiredWarehouseLocationKey(warehouse: Warehouse): string {
  if (!warehouse.locationKey) throw new Error(`Kho ${warehouse.name} thiếu locationKey`);
  return warehouse.locationKey;
}

async function seedNeighbors(warehouseId: string) {
  await prisma.neighborWarehouse.createMany({
    data: [
      {
        warehouseId,
        name: "Kho cứu trợ xã Xuân Sơn",
        distanceKm: 8,
        contactInfo: "Bộ đàm kênh 3 / 0905xxxxxx",
        summary: [
          { sku: "WATER-01", name: "Nước uống đóng chai", quantity: 2000 },
          { sku: "FIRSTAID-01", name: "Bộ sơ cứu", quantity: 30 },
          { sku: "LIFE-ADULT", name: "Áo phao người lớn", quantity: 10 },
        ],
      },
      {
        warehouseId,
        name: "Kho cứu trợ khu vực Sông Cầu",
        distanceKm: 35,
        contactInfo: "Điện thoại 0262xxxxxxx",
        summary: [
          { sku: "LIFE-ADULT", name: "Áo phao người lớn", quantity: 200 },
          { sku: "BOAT-01", name: "Xuồng cứu hộ", quantity: 12 },
          { sku: "WATER-01", name: "Nước uống đóng chai", quantity: 500 },
        ],
      },
    ],
  });
}

function legacyStatus(definition: SeedBatchDefinition): ItemStatus {
  if (definition.condition === "DAMAGED") return ItemStatus.DAMAGED;
  if (definition.condition === "NEEDS_CHECK") return ItemStatus.MAINTENANCE;
  if (definition.expiryOffsetDays != null && definition.expiryOffsetDays <= 30) {
    return ItemStatus.EXPIRING_SOON;
  }
  return ItemStatus.AVAILABLE;
}

const requiredSecret = (name: string): string => getRequiredSecret(name);

if (require.main === module) {
  main()
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : "Seed thất bại");
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
