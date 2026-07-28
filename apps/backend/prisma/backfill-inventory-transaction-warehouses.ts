import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const updated = await prisma.$executeRawUnsafe(`
    UPDATE "InventoryTransaction" AS transaction
    SET "warehouseId" = zone."warehouseId"
    FROM "ItemBatch" AS batch
    JOIN "Shelf" AS shelf ON shelf.id = batch."shelfId"
    JOIN "Zone" AS zone ON zone.id = shelf."zoneId"
    WHERE transaction."batchId" = batch.id
      AND transaction."warehouseId" IS NULL
      AND transaction."fromWarehouseId" IS NULL
      AND transaction."toWarehouseId" IS NULL
  `);
  console.log(`Backfilled warehouse snapshot for ${updated} inventory transactions.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
