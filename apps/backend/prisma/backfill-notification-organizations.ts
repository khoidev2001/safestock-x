import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const fromWarehouse = await prisma.$executeRaw`
    UPDATE "Notification" AS notification
    SET "organizationId" = warehouse."organizationId"
    FROM "Warehouse" AS warehouse
    WHERE notification."organizationId" IS NULL
      AND notification."warehouseId" = warehouse."id"
  `;
  const fromMission = await prisma.$executeRaw`
    UPDATE "Notification" AS notification
    SET "organizationId" = warehouse."organizationId"
    FROM "Mission" AS mission
    JOIN "Warehouse" AS warehouse ON warehouse."id" = mission."warehouseId"
    WHERE notification."organizationId" IS NULL
      AND notification."missionId" = mission."id"
  `;

  const organizations = await prisma.organization.findMany({
    select: { id: true },
    take: 2,
  });
  const beforeSingleOrganizationFallback = await prisma.notification.count({
    where: { organizationId: null },
  });
  const fromSingleOrganization =
    organizations.length === 1 && beforeSingleOrganizationFallback > 0
      ? (
          await prisma.notification.updateMany({
            where: { organizationId: null },
            data: { organizationId: organizations[0].id },
          })
        ).count
      : 0;

  const [total, unscoped] = await Promise.all([
    prisma.notification.count(),
    prisma.notification.count({ where: { organizationId: null } }),
  ]);
  console.log(
    JSON.stringify({
      total,
      backfilledFromWarehouse: fromWarehouse,
      backfilledFromMission: fromMission,
      backfilledFromSingleOrganization: fromSingleOrganization,
      unscoped,
    }),
  );
  if (unscoped > 0) {
    throw new Error(
      `${unscoped} notification(s) remain unscoped because their organization cannot be proven`,
    );
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "Notification backfill failed");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
