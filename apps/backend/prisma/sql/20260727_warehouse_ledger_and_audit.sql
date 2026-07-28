BEGIN;

ALTER TABLE "InventoryTransaction"
  ADD COLUMN IF NOT EXISTS "beforeQuantity" INTEGER,
  ADD COLUMN IF NOT EXISTS "afterQuantity" INTEGER,
  ADD COLUMN IF NOT EXISTS "quantityDelta" INTEGER;

ALTER TABLE "AuditLog"
  ADD COLUMN IF NOT EXISTS "organizationId" TEXT,
  ADD COLUMN IF NOT EXISTS "warehouseId" TEXT,
  ADD COLUMN IF NOT EXISTS "correlationId" TEXT;

CREATE INDEX IF NOT EXISTS "AuditLog_organizationId_createdAt_idx"
  ON "AuditLog" ("organizationId", "createdAt");
CREATE INDEX IF NOT EXISTS "AuditLog_warehouseId_createdAt_idx"
  ON "AuditLog" ("warehouseId", "createdAt");
CREATE INDEX IF NOT EXISTS "AuditLog_correlationId_idx"
  ON "AuditLog" ("correlationId");

UPDATE "AuditLog" AS audit
SET "organizationId" = actor."organizationId"
FROM "User" AS actor
WHERE audit."actorId" = actor.id
  AND audit."organizationId" IS NULL;

UPDATE "AuditLog"
SET "warehouseId" = metadata->>'warehouseId'
WHERE "warehouseId" IS NULL
  AND metadata IS NOT NULL
  AND jsonb_typeof(metadata) = 'object'
  AND NULLIF(metadata->>'warehouseId', '') IS NOT NULL;

COMMIT;
