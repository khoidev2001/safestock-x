import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const organizations = await prisma.$executeRawUnsafe(`
    UPDATE "AuditLog" AS audit
    SET "organizationId" = actor."organizationId"
    FROM "User" AS actor
    WHERE audit."actorId" = actor.id
      AND audit."organizationId" IS NULL
  `);
  const warehouses = await prisma.$executeRawUnsafe(`
    UPDATE "AuditLog"
    SET "warehouseId" = metadata->>'warehouseId'
    WHERE "warehouseId" IS NULL
      AND metadata IS NOT NULL
      AND jsonb_typeof(metadata) = 'object'
      AND NULLIF(metadata->>'warehouseId', '') IS NOT NULL
  `);
  console.info(
    `Audit scope backfill complete: organizations=${organizations}, warehouses=${warehouses}`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
