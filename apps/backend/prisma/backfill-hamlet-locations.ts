import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient, type WarehouseLocationMethod, type WarehouseKind } from "@prisma/client";
import {
  HAMLET_LOCATION_IDENTITIES,
  loadHamletCulturalHouseLocations,
  type HamletCulturalHouseLocation,
  type HamletCulturalHouseLocationDataset,
} from "./hamlet-location-data";

const prisma = new PrismaClient();
const COMMUNE_ID = "dong-xuan";
const REPORT_DIR = resolve(__dirname, "../../../plans/reports");

export interface WarehouseLocationRow {
  id: string;
  organizationId: string;
  name: string;
  kind: WarehouseKind;
  communeId: string;
  lat: number | null;
  lng: number | null;
  locationKey: string | null;
  locationMethod: WarehouseLocationMethod | null;
  locationSourceName: string | null;
  locationSourceUrl: string | null;
  locationSourceRef: string | null;
  locationCheckedAt: Date | null;
  locationMethodNote: string | null;
  locationUpdatedAt: Date | null;
}

export type BackfillDisposition =
  | "ELIGIBLE"
  | "SKIP_UNRESOLVED"
  | "SKIP_POSITIONED"
  | "SKIP_PARTIAL_COORDINATES"
  | "SKIP_PROVENANCE_CONFLICT";

export interface HamletBackfillEntry {
  warehouse: WarehouseLocationRow;
  location: HamletCulturalHouseLocation;
  disposition: BackfillDisposition;
}

export interface HamletBackfillPlan {
  datasetVersion: string;
  entries: HamletBackfillEntry[];
  errors: string[];
}

interface BackfillReport {
  mode: "dry-run" | "apply" | "rollback";
  createdAt: string;
  datasetVersion: string;
  boundaryRef: string;
  entries: Array<{
    warehouseId: string;
    organizationId: string;
    warehouseName: string;
    locationKey: string;
    disposition: BackfillDisposition;
    before: ReturnType<typeof serializeWarehouseLocation>;
    culturalHouse: HamletCulturalHouseLocation;
    outcome?: "APPLIED" | "CONCURRENTLY_SKIPPED" | "ROLLED_BACK" | "ROLLBACK_SKIPPED";
  }>;
}

export function prepareHamletLocationBackfill(
  rows: WarehouseLocationRow[],
  dataset: HamletCulturalHouseLocationDataset,
): HamletBackfillPlan {
  const errors: string[] = [];
  const entries: HamletBackfillEntry[] = [];
  const locationByKey = new Map(dataset.locations.map((location) => [location.key, location]));
  const identityByName = new Map(
    HAMLET_LOCATION_IDENTITIES.map(([key, name]) => [`Kho thôn ${name}`, key]),
  );
  const rowsByOrganization = groupBy(rows, (row) => row.organizationId);

  if (rowsByOrganization.size === 0) errors.push(`Không tìm thấy kho thôn ${COMMUNE_ID}`);

  for (const [organizationId, organizationRows] of rowsByOrganization) {
    const rowsByName = groupBy(organizationRows, (row) => row.name);
    const rowsByLocationKey = groupBy(
      organizationRows.filter((row) => row.locationKey !== null),
      (row) => row.locationKey as string,
    );

    for (const [name, key] of identityByName) {
      const matches = rowsByName.get(name) ?? [];
      if (matches.length === 0) {
        errors.push(`Tổ chức ${organizationId} thiếu ${name}`);
        continue;
      }
      if (matches.length > 1) {
        errors.push(`Tổ chức ${organizationId} có ${matches.length} kho trùng tên ${name}`);
        continue;
      }

      const warehouse = matches[0];
      const location = locationByKey.get(key);
      if (!location) {
        errors.push(`Bộ dữ liệu thiếu điểm ${key}`);
        continue;
      }
      if (warehouse.kind !== "HAMLET" || warehouse.communeId !== COMMUNE_ID) {
        errors.push(`${warehouse.name} không thuộc phạm vi HAMLET/${COMMUNE_ID}`);
        continue;
      }
      if (warehouse.locationKey && warehouse.locationKey !== key) {
        errors.push(`${warehouse.name} đang có locationKey xung đột: ${warehouse.locationKey}`);
        continue;
      }
      const keyOwners = rowsByLocationKey.get(key) ?? [];
      if (keyOwners.some((owner) => owner.id !== warehouse.id)) {
        errors.push(`locationKey ${key} đã thuộc một kho khác trong tổ chức ${organizationId}`);
        continue;
      }

      entries.push({ warehouse, location, disposition: classifyWarehouse(warehouse, location) });
    }

    for (const row of organizationRows) {
      if (row.locationKey && locationByKey.has(row.locationKey)) {
        const expectedKey = identityByName.get(row.name);
        if (expectedKey !== row.locationKey) {
          errors.push(`${row.name} dùng locationKey dành cho kho khác: ${row.locationKey}`);
        }
      }
    }
  }

  return { datasetVersion: dataset.version, entries, errors: [...new Set(errors)] };
}

export async function applyHamletLocationBackfill(
  client: Pick<PrismaClient, "$transaction">,
  plan: HamletBackfillPlan,
  appliedAt: Date,
): Promise<Map<string, "APPLIED" | "CONCURRENTLY_SKIPPED">> {
  if (plan.errors.length > 0) {
    throw new Error(`Không thể apply backfill:\n- ${plan.errors.join("\n- ")}`);
  }

  const outcomes = new Map<string, "APPLIED" | "CONCURRENTLY_SKIPPED">();
  await client.$transaction(async (tx) => {
    for (const entry of plan.entries) {
      if (entry.disposition !== "ELIGIBLE") continue;
      const location = entry.location;
      const result = await tx.warehouse.updateMany({
        where: {
          id: entry.warehouse.id,
          organizationId: entry.warehouse.organizationId,
          communeId: COMMUNE_ID,
          kind: "HAMLET",
          lat: null,
          lng: null,
          locationKey: entry.warehouse.locationKey,
          OR: [{ locationMethod: null }, { locationMethod: "LEGACY_UNSPECIFIED" }],
        },
        data: {
          lat: location.lat,
          lng: location.lng,
          locationKey: location.key,
          locationMethod: location.method,
          locationSourceName: location.sourceName,
          locationSourceUrl: location.sourceUrl,
          locationSourceRef: location.sourceRef,
          locationCheckedAt: new Date(location.checkedAt),
          locationMethodNote: location.methodNote,
          locationUpdatedAt: appliedAt,
        },
      });
      outcomes.set(entry.warehouse.id, result.count === 1 ? "APPLIED" : "CONCURRENTLY_SKIPPED");
    }
  });
  return outcomes;
}

async function run(): Promise<void> {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const rollbackIndex = args.indexOf("--rollback");
  if (apply && rollbackIndex >= 0)
    throw new Error("Không thể dùng đồng thời --apply và --rollback");

  if (rollbackIndex >= 0) {
    const reportPath = args[rollbackIndex + 1];
    if (!reportPath) throw new Error("--rollback cần đường dẫn report của lần apply");
    await rollbackFromReport(reportPath);
    return;
  }

  const dataset = loadHamletCulturalHouseLocations();
  const rows = await prisma.warehouse.findMany({
    where: { communeId: COMMUNE_ID, kind: "HAMLET" },
    select: warehouseLocationSelect,
    orderBy: [{ organizationId: "asc" }, { name: "asc" }],
  });
  const plan = prepareHamletLocationBackfill(rows, dataset);
  if (plan.errors.length > 0) {
    throw new Error(`Backfill bị chặn:\n- ${plan.errors.join("\n- ")}`);
  }

  const now = new Date();
  const report: BackfillReport = {
    mode: apply ? "apply" : "dry-run",
    createdAt: now.toISOString(),
    datasetVersion: dataset.version,
    boundaryRef: dataset.boundaryRef,
    entries: plan.entries.map((entry) => ({
      warehouseId: entry.warehouse.id,
      organizationId: entry.warehouse.organizationId,
      warehouseName: entry.warehouse.name,
      locationKey: entry.location.key,
      disposition: entry.disposition,
      before: serializeWarehouseLocation(entry.warehouse),
      culturalHouse: entry.location,
    })),
  };
  const reportPath = reportFilePath(report.mode, now);
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });

  if (apply) {
    const outcomes = await applyHamletLocationBackfill(prisma, plan, now);
    for (const entry of report.entries) entry.outcome = outcomes.get(entry.warehouseId);
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  }

  printSummary(report, reportPath);
}

async function rollbackFromReport(reportPath: string): Promise<void> {
  const report = JSON.parse(readFileSync(resolve(reportPath), "utf8")) as BackfillReport;
  if (report.mode !== "apply") throw new Error("Chỉ có thể rollback report của lần apply");
  const rollbackAt = new Date();

  await prisma.$transaction(async (tx) => {
    for (const entry of report.entries) {
      if (entry.outcome !== "APPLIED") continue;
      const location = entry.culturalHouse;
      const result = await tx.warehouse.updateMany({
        where: {
          id: entry.warehouseId,
          organizationId: entry.organizationId,
          lat: location.lat,
          lng: location.lng,
          locationKey: entry.locationKey,
          locationMethod: location.method,
          locationSourceRef: location.sourceRef,
          locationUpdatedAt: new Date(report.createdAt),
        },
        data: deserializeWarehouseLocation(entry.before),
      });
      entry.outcome = result.count === 1 ? "ROLLED_BACK" : "ROLLBACK_SKIPPED";
    }
  });

  const rollbackReport: BackfillReport = {
    ...report,
    mode: "rollback",
    createdAt: rollbackAt.toISOString(),
  };
  const outputPath = reportFilePath("rollback", rollbackAt);
  writeFileSync(outputPath, `${JSON.stringify(rollbackReport, null, 2)}\n`, { flag: "wx" });
  printSummary(rollbackReport, outputPath);
}

function classifyWarehouse(
  warehouse: WarehouseLocationRow,
  location: HamletCulturalHouseLocation,
): BackfillDisposition {
  if (location.reviewStatus !== "APPROVED" || location.lat == null || location.lng == null) {
    return "SKIP_UNRESOLVED";
  }
  if ((warehouse.lat === null) !== (warehouse.lng === null)) return "SKIP_PARTIAL_COORDINATES";
  if (warehouse.lat !== null && warehouse.lng !== null) return "SKIP_POSITIONED";
  if (warehouse.locationMethod && warehouse.locationMethod !== "LEGACY_UNSPECIFIED") {
    return "SKIP_PROVENANCE_CONFLICT";
  }
  return "ELIGIBLE";
}

function serializeWarehouseLocation(warehouse: WarehouseLocationRow) {
  return {
    lat: warehouse.lat,
    lng: warehouse.lng,
    locationKey: warehouse.locationKey,
    locationMethod: warehouse.locationMethod,
    locationSourceName: warehouse.locationSourceName,
    locationSourceUrl: warehouse.locationSourceUrl,
    locationSourceRef: warehouse.locationSourceRef,
    locationCheckedAt: warehouse.locationCheckedAt?.toISOString() ?? null,
    locationMethodNote: warehouse.locationMethodNote,
    locationUpdatedAt: warehouse.locationUpdatedAt?.toISOString() ?? null,
  };
}

function deserializeWarehouseLocation(before: ReturnType<typeof serializeWarehouseLocation>) {
  return {
    ...before,
    locationCheckedAt: before.locationCheckedAt ? new Date(before.locationCheckedAt) : null,
    locationUpdatedAt: before.locationUpdatedAt ? new Date(before.locationUpdatedAt) : null,
  };
}

function reportFilePath(mode: BackfillReport["mode"], now: Date): string {
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  return resolve(REPORT_DIR, `warehouse-location-${mode}-${stamp}.json`);
}

function printSummary(report: BackfillReport, path: string): void {
  const counts = new Map<string, number>();
  for (const entry of report.entries) {
    const key = entry.outcome ?? entry.disposition;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  console.log(
    `${report.mode === "dry-run" ? "DRY RUN — không ghi database" : report.mode.toUpperCase()}`,
  );
  console.table(Object.fromEntries(counts));
  console.log(`Report: ${path}`);
}

function groupBy<T>(values: T[], key: (value: T) => string): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const value of values) {
    const groupKey = key(value);
    grouped.set(groupKey, [...(grouped.get(groupKey) ?? []), value]);
  }
  return grouped;
}

const warehouseLocationSelect = {
  id: true,
  organizationId: true,
  name: true,
  kind: true,
  communeId: true,
  lat: true,
  lng: true,
  locationKey: true,
  locationMethod: true,
  locationSourceName: true,
  locationSourceUrl: true,
  locationSourceRef: true,
  locationCheckedAt: true,
  locationMethodNote: true,
  locationUpdatedAt: true,
} as const;

if (require.main === module) {
  run()
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
