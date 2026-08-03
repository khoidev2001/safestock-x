/**
 * Nạp lại tồn kho từ đúng bộ dữ liệu chuẩn trong seed-data.ts, KHÔNG đụng tới kho,
 * người dùng, thôn đã ghim hay lịch sử.
 *
 * Dùng khi đã dọn sạch ItemBatch để test từ đầu rồi muốn có hàng lại mà không phải
 * chạy `pnpm be:db` — lệnh đó xoá cả toạ độ thôn đã ghim và mọi thứ khác.
 *
 * Số lượng, mã lô, kệ, hạn dùng và tình trạng lấy nguyên từ CENTRAL_BATCHES và
 * HAMLET_WAREHOUSES nên khớp tuyệt đối với seed — không có số nào tôi tự bịa.
 *
 * Chạy: pnpm --filter @safestock/backend exec ts-node prisma/restock-from-seed-dataset.ts
 */
import { ItemCondition, ItemStatus, PrismaClient } from "@prisma/client";

import { CENTRAL_BATCHES, HAMLET_WAREHOUSES } from "./seed-data";
import { dateFromOffset } from "./seed-support";

const prisma = new PrismaClient();

type BatchDefinition = (typeof CENTRAL_BATCHES)[number];

/** Cùng quy tắc với seed.ts: status cũ suy ra từ tình trạng và hạn dùng. */
function legacyStatus(definition: BatchDefinition): ItemStatus {
  if (definition.condition === "DAMAGED") return ItemStatus.DAMAGED;
  if (definition.condition === "NEEDS_CHECK") return ItemStatus.MAINTENANCE;
  if (definition.expiryOffsetDays != null && definition.expiryOffsetDays <= 30) {
    return ItemStatus.EXPIRING_SOON;
  }
  return ItemStatus.AVAILABLE;
}

async function main() {
  const existing = await prisma.itemBatch.count();
  if (existing > 0) {
    throw new Error(
      `Kho đang có ${existing} lô. Script này chỉ nạp vào kho rỗng để khỏi nhân đôi tồn.`,
    );
  }

  const itemBySku = new Map(
    (await prisma.item.findMany({ select: { id: true, sku: true } })).map((i) => [i.sku, i.id]),
  );

  // ===== Kho trung tâm =====
  const central = await prisma.warehouse.findFirstOrThrow({ where: { kind: "CENTRAL" } });
  const centralShelves = new Map(
    (
      await prisma.shelf.findMany({
        where: { zone: { warehouseId: central.id } },
        select: { id: true, code: true },
      })
    ).map((s) => [s.code, s.id]),
  );

  let centralCount = 0;
  for (const definition of CENTRAL_BATCHES) {
    const itemId = itemBySku.get(definition.sku);
    const shelfId = centralShelves.get(definition.shelfCode);
    if (!itemId) throw new Error(`Thiếu mã vật tư ${definition.sku}`);
    if (!shelfId) throw new Error(`Kho trung tâm thiếu kệ ${definition.shelfCode}`);
    await prisma.itemBatch.create({
      data: {
        itemId,
        shelfId,
        batchCode: definition.batchCode,
        quantity: definition.quantity,
        status: legacyStatus(definition),
        condition: definition.condition as ItemCondition,
        circulation: definition.circulation ?? "IN_STOCK",
        expiryDate: dateFromOffset(definition.expiryOffsetDays),
        inspectedAt: dateFromOffset(
          definition.inspectedOffsetDays == null ? null : -definition.inspectedOffsetDays,
        ),
      },
    });
    centralCount++;
  }
  console.log(`Kho trung tâm: ${centralCount} lô`);

  // ===== 17 kho thôn =====
  let hamletCount = 0;
  for (let index = 0; index < HAMLET_WAREHOUSES.length; index++) {
    const definition = HAMLET_WAREHOUSES[index];
    const warehouse = await prisma.warehouse.findFirst({ where: { name: definition.name } });
    if (!warehouse) {
      console.warn(`  bỏ qua ${definition.name}: không tìm thấy kho`);
      continue;
    }
    const shelf = await prisma.shelf.findFirst({
      where: { zone: { warehouseId: warehouse.id } },
      orderBy: { code: "asc" },
    });
    if (!shelf) {
      console.warn(`  bỏ qua ${definition.name}: kho chưa có kệ`);
      continue;
    }

    for (const stock of definition.stock) {
      const itemId = itemBySku.get(stock.sku);
      if (!itemId) throw new Error(`${definition.name} dùng SKU không tồn tại: ${stock.sku}`);
      await prisma.itemBatch.create({
        data: {
          itemId,
          shelfId: shelf.id,
          batchCode: `${stock.sku}-${definition.key.toUpperCase()}`,
          quantity: stock.quantity,
          status: ItemStatus.AVAILABLE,
          condition: ItemCondition.NEW,
          expiryDate: dateFromOffset(stock.expiryOffsetDays),
          inspectedAt: dateFromOffset(-(2 + (index % 6))),
        },
      });
      hamletCount++;
    }
  }
  console.log(`17 kho thôn: ${hamletCount} lô`);
  console.log(`\nTổng: ${centralCount + hamletCount} lô.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
