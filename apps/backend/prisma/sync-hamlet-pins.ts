/**
 * Đồng bộ toạ độ ADMIN vừa ghim, rồi in khối code để chép vào seed.
 *
 * Ghim trên /map chỉ ghi vào bảng Hamlet (điểm ứng phó), KHÔNG chép sang bảng
 * Warehouse (vị trí kho). Kho thiếu toạ độ thì vẫn làm nghiệp vụ tồn kho bình
 * thường nhưng không tính được quãng đường và ETA khi điều hàng — lệch âm thầm,
 * không có thông báo nào. Đã xảy ra hai lần nên gộp vào một lệnh cho khỏi quên.
 *
 * Làm hai việc, chạy được nhiều lần mà không hỏng gì:
 *   1. Chép toạ độ điểm thôn đã xác minh sang kho thôn tương ứng.
 *   2. In khối ADMIN_PINNED_HAMLET_WAREHOUSES để chép vào
 *      admin-pinned-hamlet-points.ts — nếu không, toạ độ mất khi seed lại và máy
 *      khác clone về vẫn thiếu.
 *
 * Chỉ in thôn KHÔNG có trong registry Google Maps, vì thôn tra được Nhà văn hoá
 * thì toạ độ đã nằm sẵn ở verified-warehouse-location.ts.
 *
 * Chạy: pnpm --filter @safestock/backend exec ts-node prisma/sync-hamlet-pins.ts
 */
import { PrismaClient } from "@prisma/client";

import { HAMLET_WAREHOUSES } from "./seed-data";
import { getVerifiedHamletWarehouseLocation } from "./verified-warehouse-location";

const prisma = new PrismaClient();

/** Cùng độ chính xác với toạ độ Leaflet trả về; lệch dưới mức này coi như trùng. */
const SAME_POINT_EPSILON = 1e-9;

async function main() {
  const keyByHamletName = new Map(HAMLET_WAREHOUSES.map((w) => [w.hamletName, w.key]));

  const hamlets = await prisma.hamlet.findMany({
    where: { verified: true, lat: { not: null }, lng: { not: null } },
    orderBy: { name: "asc" },
  });

  // ===== 1. Chép sang kho =====
  let synced = 0;
  const skipped: string[] = [];
  for (const hamlet of hamlets) {
    const warehouse = await prisma.warehouse.findFirst({
      where: { name: `Kho thôn ${hamlet.name}` },
    });
    if (!warehouse) {
      skipped.push(`${hamlet.name}: không tìm thấy kho thôn tương ứng`);
      continue;
    }
    const same =
      warehouse.lat != null &&
      warehouse.lng != null &&
      Math.abs(warehouse.lat - hamlet.lat!) < SAME_POINT_EPSILON &&
      Math.abs(warehouse.lng - hamlet.lng!) < SAME_POINT_EPSILON;
    if (same) continue;

    await prisma.warehouse.update({
      where: { id: warehouse.id },
      data: { lat: hamlet.lat, lng: hamlet.lng },
    });
    console.log(`  đồng bộ ${warehouse.name}`);
    synced++;
  }
  console.log(synced ? `\nĐã đồng bộ ${synced} kho.\n` : "Toạ độ kho đã khớp, không phải sửa.\n");

  // ===== 2. In khối code =====
  const rows: string[] = [];
  for (const hamlet of hamlets) {
    const key = keyByHamletName.get(hamlet.name);
    if (!key) {
      skipped.push(`${hamlet.name}: không khớp thôn nào trong seed-data`);
      continue;
    }
    if (getVerifiedHamletWarehouseLocation(key)) continue; // Đã có trong registry Maps.
    const pinnedAt = (hamlet.verifiedAt ?? new Date()).toISOString().slice(0, 10);
    rows.push(`  "${key}": { lat: ${hamlet.lat}, lng: ${hamlet.lng}, pinnedAt: "${pinnedAt}" },`);
  }

  console.log("Chép khối dưới đây vào prisma/admin-pinned-hamlet-points.ts:\n");
  console.log(
    "export const ADMIN_PINNED_HAMLET_WAREHOUSES: " +
      "Record<string, AdminPinnedWarehouseLocation> = {",
  );
  rows.forEach((row) => console.log(row));
  console.log("};");
  console.log(`\n// ${rows.length} điểm ADMIN ghim tay.`);

  const pending = await prisma.hamlet.count({ where: { verified: false } });
  if (pending > 0) console.log(`// Còn ${pending} thôn chưa ghim.`);
  skipped.forEach((line) => console.warn(`// BỎ QUA: ${line}`));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
