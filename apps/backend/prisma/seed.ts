import { config } from "dotenv";
import { resolveEnvFilePaths } from "../src/config/env-file-path";

config({ path: resolveEnvFilePaths() });

import {
  ItemCondition,
  ItemStatus,
  PrismaClient,
  type Warehouse,
  type WarehouseZone,
  type Shelf,
} from "@prisma/client";
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
import { getVerifiedNeighborContact } from "./verified-neighbor-contact";
import {
  HOME_COMMUNE_WAREHOUSE_LOCATION,
  getVerifiedCommuneReferencePoint,
  validateVerifiedWarehouseLocations,
} from "./verified-warehouse-location";
import { normalizeHamletName } from "../src/admin/hamlet-normalization";

const prisma = new PrismaClient();
const COMMUNE_ID = "dong-xuan";

async function resetDatabase() {
  await prisma.incidentAction.deleteMany();
  await prisma.incidentEvidence.deleteMany();
  await prisma.incident.deleteMany();
  await prisma.missionRequirement.deleteMany();
  await prisma.missionFieldUpdate.deleteMany();
  await prisma.missionAnalysisSnapshot.deleteMany();
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
  const validationErrors = validateSeedDataset();
  validationErrors.push(...validateVerifiedWarehouseLocations());
  if (validationErrors.length > 0) {
    throw new Error(`Bộ dữ liệu seed không hợp lệ:\n- ${validationErrors.join("\n- ")}`);
  }

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
        passwordHash: password("admin123@"),
        fullName: "Quản trị hệ thống",
        role: "ADMIN",
      },
      {
        organizationId: organization.id,
        email: "staff@safestock.vn",
        passwordHash: password("staff123"),
        fullName: "Phụ trách kho trung tâm",
        role: "WAREHOUSE",
      },
      {
        organizationId: organization.id,
        email: "rescue@safestock.vn",
        passwordHash: password("rescue123"),
        fullName: "Lực lượng hiện trường Đồng Xuân",
        role: "RESCUE",
      },
    ],
  });

  const centralWarehouse = await prisma.warehouse.create({
    data: {
      organizationId: organization.id,
      name: "Kho cứu trợ trung tâm Đồng Xuân",
      location: HOME_COMMUNE_WAREHOUSE_LOCATION.address,
      kind: "CENTRAL",
      communeId: COMMUNE_ID,
      lat: HOME_COMMUNE_WAREHOUSE_LOCATION.lat,
      lng: HOME_COMMUNE_WAREHOUSE_LOCATION.lng,
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
  await prisma.hamlet.createMany({
    data: HAMLET_WAREHOUSES.map((warehouse) => ({
      organizationId: organization.id,
      communeId: COMMUNE_ID,
      name: warehouse.name,
      normalizedName: normalizeHamletName(warehouse.name),
      aliases: [normalizeHamletName(warehouse.name)],
      // Admin must pin and verify response points before dispatch; no fake seed coordinates.
      lat: null,
      lng: null,
      verified: false,
    })),
  });
  const hamletLeaderIds = await createHamletLeaders(
    organization.id,
    hamletWarehouses,
    password("truongthon123"),
  );

  // Trưởng thôn báo cáo tình huống từ mobile (role REPORTER) — scope kho thôn đầu tiên.
  const reportingHamlet = hamletWarehouses[0] ?? centralWarehouse;
  await prisma.user.create({
    data: {
      organizationId: organization.id,
      email: "truongthon@safestock.vn",
      passwordHash: password("reporter123"),
      fullName: `Trưởng thôn ${reportingHamlet.name.replace("Kho ", "")}`,
      role: "REPORTER",
      warehouseId: reportingHamlet.id,
    },
  });

  const deviceByCode = await seedDevices(prisma, {
    centralWarehouse,
    centralZones: zones,
    centralShelves: shelves,
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
  for (let index = 0; index < HAMLET_WAREHOUSES.length; index++) {
    const definition = HAMLET_WAREHOUSES[index];
    const warehouse = await prisma.warehouse.create({
      data: {
        organizationId,
        name: definition.name,
        location: definition.location,
        kind: "HAMLET",
        communeId: COMMUNE_ID,
        lat: definition.lat,
        lng: definition.lng,
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
      data: {
        organizationId,
        email: `truongthon${index + 1}@safestock.vn`,
        passwordHash,
        fullName: `Trưởng ${warehouse.name.replace("Kho ", "")}`,
        role: "WAREHOUSE",
        warehouseId: warehouse.id,
      },
    });
    leaderIds.set(warehouse.id, user.id);
  }
  return leaderIds;
}

async function seedNeighbors(warehouseId: string) {
  // External reference metadata only: never an operational Organization/Warehouse or stock promise.
  // Coordinates live in the verified public reference registry; availability remains UNKNOWN.
  const externalBoundaryCommunes = [
    "Xuân Thọ",
    "Tuy An Bắc",
    "Tuy An Tây",
    "Xuân Lãnh",
    "Phú Mỡ",
    "Xuân Phước",
  ];
  await prisma.neighborWarehouse.createMany({
    data: externalBoundaryCommunes.map((commune) => {
      const referencePoint = getVerifiedCommuneReferencePoint(commune);
      if (!referencePoint) {
        throw new Error(`Thiếu điểm UBND đã xác minh cho xã ${commune}`);
      }
      return {
        warehouseId,
        name: `[EXTERNAL/AVAILABILITY UNKNOWN] ${referencePoint.name}`,
        // Không gắn khoảng cách đường chim bay vào trường khoảng cách tuyến.
        distanceKm: 0,
        contactInfo: getVerifiedNeighborContact(commune),
        summary: [],
      };
    }),
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

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
