import { MissionStatus, Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface Allocation {
  batchId?: string;
  qty?: number;
  warehouseId?: string;
}

function participantWarehouseIds(
  requirements: { allocations: Prisma.JsonValue }[],
  sourceWarehouseId: string,
): string[] {
  const warehouseIds = new Set<string>();
  for (const requirement of requirements) {
    const allocations = (requirement.allocations as Allocation[] | null) ?? [];
    for (const allocation of allocations) {
      if (
        allocation.batchId &&
        Number.isFinite(allocation.qty) &&
        (allocation.qty ?? 0) > 0
      ) {
        warehouseIds.add(allocation.warehouseId ?? sourceWarehouseId);
      }
    }
  }
  if (warehouseIds.size === 0) warehouseIds.add(sourceWarehouseId);
  return [...warehouseIds];
}

async function main() {
  const missions = await prisma.mission.findMany({
    where: {
      status: {
        in: [
          MissionStatus.PENDING_WAREHOUSE,
          MissionStatus.READY,
          MissionStatus.COMPLETED,
        ],
      },
    },
    select: {
      id: true,
      warehouseId: true,
      status: true,
      requirements: { select: { allocations: true } },
    },
  });

  let created = 0;
  const backfilledAt = new Date();
  for (const mission of missions) {
    const warehouseIds = participantWarehouseIds(
      mission.requirements,
      mission.warehouseId,
    );
    const result = await prisma.missionWarehousePreparation.createMany({
      data: warehouseIds.map((warehouseId) => ({
        missionId: mission.id,
        warehouseId,
        preparedAt:
          mission.status === MissionStatus.PENDING_WAREHOUSE ? null : backfilledAt,
      })),
      skipDuplicates: true,
    });
    created += result.count;
  }

  console.log(
    `Backfill mission warehouse preparations: scanned=${missions.length}, created=${created}`,
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
