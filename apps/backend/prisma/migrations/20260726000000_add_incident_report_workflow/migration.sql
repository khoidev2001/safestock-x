-- Additive incident-report workflow storage. Existing rows are retained and classified conservatively.
CREATE TYPE "ReportProcessingState" AS ENUM (
  'SUBMITTED',
  'ANALYZING',
  'ANALYZED',
  'ANALYSIS_FAILED'
);

ALTER TABLE "Mission"
  ADD COLUMN "reportProcessingState" "ReportProcessingState",
  ADD COLUMN "analysisClaimToken" TEXT,
  ADD COLUMN "analysisClaimedAt" TIMESTAMP(3),
  ADD COLUMN "updatedAt" TIMESTAMP(3);

ALTER TABLE "Mission"
  ADD CONSTRAINT "Mission_warehouseId_fkey"
  FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

UPDATE "Mission"
SET "updatedAt" = "createdAt"
WHERE "updatedAt" IS NULL;

ALTER TABLE "Mission"
  ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP,
  ALTER COLUMN "updatedAt" SET NOT NULL;

CREATE TABLE "MissionAudio" (
  "id" TEXT NOT NULL,
  "missionId" TEXT NOT NULL,
  "bytes" BYTEA NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "durationSeconds" DOUBLE PRECISION,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MissionAudio_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MissionAudio_missionId_fkey"
    FOREIGN KEY ("missionId") REFERENCES "Mission"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MissionAudio_sizeBytes_check" CHECK ("sizeBytes" > 0 AND "sizeBytes" <= 5242880),
  CONSTRAINT "MissionAudio_bytes_size_check" CHECK (octet_length("bytes") = "sizeBytes")
);

ALTER TABLE "Notification"
  ADD COLUMN "organizationId" TEXT;

CREATE INDEX "Mission_createdByUserId_createdAt_id_idx"
  ON "Mission"("createdByUserId", "createdAt", "id");
CREATE INDEX "Mission_warehouseId_createdAt_id_idx"
  ON "Mission"("warehouseId", "createdAt", "id");
CREATE INDEX "Mission_reportProcessingState_analysisClaimedAt_idx"
  ON "Mission"("reportProcessingState", "analysisClaimedAt");
CREATE INDEX "Mission_warehouseId_reportProcessingState_analysisClaimedAt_idx"
  ON "Mission"("warehouseId", "reportProcessingState", "analysisClaimedAt");
CREATE INDEX "Notification_incident_access_idx"
  ON "Notification"("recipientRole", "kind", "organizationId", "read", "createdAt");

-- Backfill organization only through the verified Mission -> Warehouse relation.
UPDATE "Notification" AS n
SET "organizationId" = w."organizationId"
FROM "Mission" AS m
JOIN "Warehouse" AS w ON w."id" = m."warehouseId"
WHERE n."missionId" = m."id"
  AND n."kind" = 'INCIDENT_REPORTED'
  AND n."organizationId" IS NULL;

-- Scope every Mission/warehouse-derived notification that can be resolved safely.
UPDATE "Notification" AS n
SET "organizationId" = w."organizationId"
FROM "Mission" AS m
JOIN "Warehouse" AS w ON w."id" = m."warehouseId"
WHERE n."missionId" = m."id"
  AND n."organizationId" IS NULL;

UPDATE "Notification" AS n
SET "organizationId" = w."organizationId"
FROM "Warehouse" AS w
WHERE n."warehouseId" = w."id"
  AND n."organizationId" IS NULL;

-- Classify only report-shaped rows. Generic and ambiguous Missions remain null.
UPDATE "Mission" AS m
SET "reportProcessingState" = CASE
  WHEN EXISTS (
    SELECT 1
    FROM "MissionRequirement" AS mr
    WHERE mr."missionId" = m."id"
  )
  OR m."actionPlan" IS NOT NULL
  OR m."readinessAssessment" IS NOT NULL
  OR m."status" <> 'DRAFT'
    THEN 'ANALYZED'::"ReportProcessingState"
  ELSE 'SUBMITTED'::"ReportProcessingState"
END
WHERE m."reportText" IS NOT NULL
  AND m."createdByUserId" IS NOT NULL
  AND (
    EXISTS (
      SELECT 1
      FROM "User" AS u
      WHERE u."id" = m."createdByUserId"
        AND u."role" = 'REPORTER'
    )
    OR EXISTS (
      SELECT 1
      FROM "Notification" AS n
      WHERE n."missionId" = m."id"
        AND n."kind" = 'INCIDENT_REPORTED'
    )
  );

CREATE UNIQUE INDEX "MissionAudio_missionId_key"
  ON "MissionAudio"("missionId");

-- Per-source-warehouse fulfillment for reviewed incident reports.
CREATE TYPE "MissionWarehouseRequestStatus" AS ENUM (
  'PENDING',
  'ACCEPTED',
  'PREPARED'
);

CREATE TABLE "MissionWarehouseRequest" (
  "id" TEXT NOT NULL,
  "missionId" TEXT NOT NULL,
  "warehouseId" TEXT NOT NULL,
  "sku" TEXT NOT NULL,
  "itemName" TEXT NOT NULL,
  "unit" TEXT NOT NULL,
  "requestedQuantity" INTEGER NOT NULL,
  "preparedQuantity" INTEGER NOT NULL DEFAULT 0,
  "preparedAllocations" JSONB,
  "allocations" JSONB NOT NULL,
  "status" "MissionWarehouseRequestStatus" NOT NULL DEFAULT 'PENDING',
  "warehouseNote" TEXT,
  "adminNote" TEXT,
  "acceptedByUserId" TEXT,
  "preparedByUserId" TEXT,
  "preparationClaimToken" TEXT,
  "preparationClaimedAt" TIMESTAMP(3),
  "acceptedAt" TIMESTAMP(3),
  "preparedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MissionWarehouseRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MissionWarehouseRequest_missionId_fkey"
    FOREIGN KEY ("missionId") REFERENCES "Mission"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MissionWarehouseRequest_warehouseId_fkey"
    FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "MissionWarehouseRequest_quantity_check"
    CHECK ("requestedQuantity" > 0 AND "preparedQuantity" >= 0 AND "preparedQuantity" <= "requestedQuantity")
);

CREATE UNIQUE INDEX "MissionWarehouseRequest_missionId_warehouseId_sku_key"
  ON "MissionWarehouseRequest"("missionId", "warehouseId", "sku");
CREATE INDEX "MissionWarehouseRequest_warehouseId_status_createdAt_idx"
  ON "MissionWarehouseRequest"("warehouseId", "status", "createdAt");
CREATE INDEX "MissionWarehouseRequest_missionId_status_idx"
  ON "MissionWarehouseRequest"("missionId", "status");
CREATE INDEX "MissionWarehouseRequest_preparationClaimToken_idx"
  ON "MissionWarehouseRequest"("preparationClaimToken");

-- PostgreSQL does not allow a newly-added enum value to be used later in the
-- same migration transaction, but no data statements need these values here.
ALTER TYPE "NotificationKind" ADD VALUE IF NOT EXISTS 'WAREHOUSE_REQUESTED';
ALTER TYPE "NotificationKind" ADD VALUE IF NOT EXISTS 'WAREHOUSE_REQUEST_ACCEPTED';
ALTER TYPE "NotificationKind" ADD VALUE IF NOT EXISTS 'WAREHOUSE_REQUEST_REVIEW';

ALTER TABLE "Notification" ADD COLUMN "recipientUserId" TEXT;
CREATE INDEX "Notification_recipientUserId_read_createdAt_idx"
  ON "Notification"("recipientUserId", "read", "createdAt");
CREATE INDEX "Notification_warehouseId_recipientRole_read_createdAt_idx"
  ON "Notification"("warehouseId", "recipientRole", "read", "createdAt");
