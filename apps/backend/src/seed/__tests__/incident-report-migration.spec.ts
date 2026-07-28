import { readFileSync } from "fs";
import { resolve } from "path";

describe("incident report migration contract", () => {
  const sql = readFileSync(
    resolve(
      __dirname,
      "../../../prisma/migrations/20260726000000_add_incident_report_workflow/migration.sql",
    ),
    "utf8",
  );

  it("keeps Mission audio bounded, exact-sized, unique, and cascading", () => {
    expect(sql).toContain('CHECK ("sizeBytes" > 0 AND "sizeBytes" <= 5242880)');
    expect(sql).toContain('CHECK (octet_length("bytes") = "sizeBytes")');
    expect(sql).toContain('CREATE UNIQUE INDEX "MissionAudio_missionId_key"');
    expect(sql).toContain('ON DELETE CASCADE ON UPDATE CASCADE');
  });

  it("backfills timestamps, incident organizations, and report state conservatively", () => {
    expect(sql).toContain('SET "updatedAt" = "createdAt"');
    expect(sql).toContain("n.\"kind\" = 'INCIDENT_REPORTED'");
    expect(sql).toContain('n."missionId" = m."id"');
    expect(sql).toContain('n."warehouseId" = w."id"');
    expect(sql).toContain('u."role" = \'REPORTER\'');
    expect(sql).toContain('m."status" <> \'DRAFT\'');
    expect(sql).toContain('m."reportText" IS NOT NULL');
    expect(sql).toContain('m."createdByUserId" IS NOT NULL');
  });

  it("creates the access and processing indexes used by the workflow", () => {
    for (const index of [
      "Mission_createdByUserId_createdAt_id_idx",
      "Mission_warehouseId_reportProcessingState_analysisClaimedAt_idx",
      "Notification_incident_access_idx",
    ]) {
      expect(sql).toContain(index);
    }
  });

  it("stores per-warehouse fulfillment claims and the exact exported allocation snapshot", () => {
    expect(sql).toContain('"preparedAllocations" JSONB');
    expect(sql).toContain('"preparationClaimToken" TEXT');
    expect(sql).toContain('"preparationClaimedAt" TIMESTAMP(3)');
    expect(sql).toContain('MissionWarehouseRequest_preparationClaimToken_idx');
  });

  it("adds the Mission to Warehouse relation used for organization scope", () => {
    expect(sql).toContain('CONSTRAINT "Mission_warehouseId_fkey"');
    expect(sql).toContain('REFERENCES "Warehouse"("id")');
  });
});
