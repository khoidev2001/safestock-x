/**
 * In ra khối ADMIN_PINNED_HAMLET_POINTS từ database đang chạy.
 *
 * ADMIN ghim thêm thôn trên web xong thì chạy lệnh này rồi chép kết quả vào
 * admin-pinned-hamlet-points.ts — nếu không, toạ độ vừa ghim sẽ mất khi seed lại
 * và máy khác clone về vẫn thiếu.
 *
 * Chỉ in những thôn KHÔNG có trong registry Google Maps, vì thôn nào tra được Nhà
 * văn hoá thì toạ độ đã nằm sẵn ở verified-warehouse-location.ts rồi.
 *
 * Chạy: pnpm --filter @safestock/backend exec ts-node prisma/export-hamlet-pins.ts
 */
import { PrismaClient } from "@prisma/client";

import { HAMLET_WAREHOUSES } from "./seed-data";
import { getVerifiedHamletWarehouseLocation } from "./verified-warehouse-location";

const prisma = new PrismaClient();

async function main() {
  const keyByHamletName = new Map(HAMLET_WAREHOUSES.map((w) => [w.hamletName, w.key]));

  const hamlets = await prisma.hamlet.findMany({
    where: { verified: true, lat: { not: null }, lng: { not: null } },
    orderBy: { name: "asc" },
  });

  const rows: string[] = [];
  const skipped: string[] = [];
  for (const hamlet of hamlets) {
    const key = keyByHamletName.get(hamlet.name);
    if (!key) {
      skipped.push(`${hamlet.name} (không khớp thôn nào trong seed-data)`);
      continue;
    }
    if (getVerifiedHamletWarehouseLocation(key)) {
      continue; // Đã có trong registry Google Maps.
    }
    const pinnedAt = (hamlet.verifiedAt ?? new Date()).toISOString().slice(0, 10);
    rows.push(`  "${key}": { lat: ${hamlet.lat}, lng: ${hamlet.lng}, pinnedAt: "${pinnedAt}" },`);
  }

  console.log(
    "export const ADMIN_PINNED_HAMLET_WAREHOUSES: " +
      "Record<string, AdminPinnedWarehouseLocation> = {",
  );
  rows.forEach((row) => console.log(row));
  console.log("};");
  console.log(`\n// ${rows.length} điểm ADMIN ghim tay.`);
  skipped.forEach((name) => console.warn(`// BỎ QUA: ${name}`));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
