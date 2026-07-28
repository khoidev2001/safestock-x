-- CreateEnum
CREATE TYPE "WarehouseLocationMethod" AS ENUM (
  'CULTURAL_HOUSE_GOOGLE_MAPS',
  'CULTURAL_HOUSE_OSM',
  'CULTURAL_HOUSE_OFFICIAL',
  'MANUAL_ADMIN',
  'LEGACY_UNSPECIFIED'
);

-- AlterTable
ALTER TABLE "Warehouse"
  ADD COLUMN "locationKey" TEXT,
  ADD COLUMN "locationMethod" "WarehouseLocationMethod",
  ADD COLUMN "locationSourceName" TEXT,
  ADD COLUMN "locationSourceUrl" TEXT,
  ADD COLUMN "locationSourceRef" TEXT,
  ADD COLUMN "locationCheckedAt" TIMESTAMP(3),
  ADD COLUMN "locationMethodNote" TEXT,
  ADD COLUMN "locationUpdatedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "Warehouse_organizationId_locationKey_key"
  ON "Warehouse"("organizationId", "locationKey");
