-- Additive rollout for per-SKU mission preparation. Run before deploying code
-- that reads "MissionWarehouseRequest". Existing MissionWarehousePreparation
-- rows remain the compatibility/progress summary for older missions.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'MissionWarehouseRequestStatus') THEN
    CREATE TYPE "MissionWarehouseRequestStatus" AS ENUM ('PENDING', 'ACCEPTED', 'PREPARED');
  END IF;
END
$$;

ALTER TYPE "NotificationKind" ADD VALUE IF NOT EXISTS 'WAREHOUSE_REQUESTED';
ALTER TYPE "NotificationKind" ADD VALUE IF NOT EXISTS 'WAREHOUSE_REQUEST_ACCEPTED';
ALTER TYPE "NotificationKind" ADD VALUE IF NOT EXISTS 'WAREHOUSE_REQUEST_REVIEW';

CREATE TABLE IF NOT EXISTS "MissionWarehouseRequest" (
  "id" TEXT NOT NULL,
  "missionId" TEXT NOT NULL,
  "warehouseId" TEXT NOT NULL,
  "sku" TEXT NOT NULL,
  "itemName" TEXT NOT NULL,
  "unit" TEXT NOT NULL,
  "requestedQuantity" INTEGER NOT NULL,
  "preparedQuantity" INTEGER NOT NULL DEFAULT 0,
  "allocations" JSONB NOT NULL,
  "preparedAllocations" JSONB,
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
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MissionWarehouseRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MissionWarehouseRequest_missionId_fkey"
    FOREIGN KEY ("missionId") REFERENCES "Mission"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MissionWarehouseRequest_warehouseId_fkey"
    FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "MissionWarehouseRequest_acceptedByUserId_fkey"
    FOREIGN KEY ("acceptedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "MissionWarehouseRequest_preparedByUserId_fkey"
    FOREIGN KEY ("preparedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "MissionWarehouseRequest_missionId_warehouseId_sku_key"
  ON "MissionWarehouseRequest"("missionId", "warehouseId", "sku");
CREATE INDEX IF NOT EXISTS "MissionWarehouseRequest_warehouseId_status_createdAt_idx"
  ON "MissionWarehouseRequest"("warehouseId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "MissionWarehouseRequest_missionId_status_idx"
  ON "MissionWarehouseRequest"("missionId", "status");
CREATE INDEX IF NOT EXISTS "MissionWarehouseRequest_preparationClaimToken_idx"
  ON "MissionWarehouseRequest"("preparationClaimToken");
