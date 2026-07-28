import { PrismaClient, WarehouseKind } from "@prisma/client";
import { config } from "dotenv";
import { resolveEnvFilePaths } from "../src/config/env-file-path";
import { hamletSeedFromWarehouse } from "./hamlet-backfill";

config({ path: resolveEnvFilePaths() });

const prisma = new PrismaClient();

async function main() {
  const warehouses = await prisma.warehouse.findMany({
    where: { kind: WarehouseKind.HAMLET },
    select: {
      organizationId: true,
      communeId: true,
      name: true,
    },
  });
  const seedsByKey = new Map(
    warehouses.map((warehouse) => {
      const seed = hamletSeedFromWarehouse(warehouse);
      return [
        `${seed.organizationId}:${seed.communeId}:${seed.normalizedName}`,
        seed,
      ] as const;
    }),
  );
  const existing = await prisma.hamlet.findMany({
    select: {
      organizationId: true,
      communeId: true,
      normalizedName: true,
    },
  });
  for (const hamlet of existing) {
    seedsByKey.delete(
      `${hamlet.organizationId}:${hamlet.communeId}:${hamlet.normalizedName}`,
    );
  }

  const result = await prisma.hamlet.createMany({
    data: [...seedsByKey.values()],
    skipDuplicates: true,
  });
  console.log(
    `Hamlet backfill hoàn tất: tạo ${result.count}, giữ nguyên ${existing.length} bản ghi hiện có.`,
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
