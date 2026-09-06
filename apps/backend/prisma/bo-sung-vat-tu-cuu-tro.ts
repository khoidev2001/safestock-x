/**
 * Nạp phần vật tư BỔ SUNG sau đợt chạy thử 20 kịch bản bão/lũ/sạt lở vào DB đang
 * chạy — KHÔNG đụng tới kho, người dùng, thôn đã ghim, nhiệm vụ hay lịch sử.
 *
 * Vì sao không chạy `pnpm be:db`: lệnh đó xoá sạch rồi seed lại, mất cả toạ độ thôn
 * ADMIN đã ghim tay lẫn toàn bộ nhiệm vụ đang thử. Script này chỉ THÊM phần còn
 * thiếu, và chạy lại bao nhiêu lần cũng ra cùng một kết quả.
 *
 * Nguồn số liệu là chính `seed-data.ts` — không có con số nào viết riêng ở đây, nên
 * DB đang chạy và bộ seed chuẩn không thể trôi khỏi nhau.
 *
 * Chạy: pnpm --filter @safestock/backend exec ts-node prisma/bo-sung-vat-tu-cuu-tro.ts
 */
import { ItemCondition, ItemStatus, PrismaClient } from "@prisma/client";

import { CENTRAL_BATCHES, HAMLET_WAREHOUSES, STANDARD_ITEMS } from "./seed-data";
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

const summary = { itemMoi: 0, nhomMoi: 0, loKhoTong: 0, loKhoThon: 0, boQua: 0 };

/**
 * Danh mục: thêm nhóm và mặt hàng còn thiếu, giữ nguyên thứ đã có.
 *
 * Không `update` mặt hàng cũ: tên và cân nặng của chúng có thể đã được ADMIN sửa
 * trên giao diện, và một script nạp hàng thì không có tư cách ghi đè lên đó.
 */
async function bagSungDanhMuc(): Promise<Map<string, string>> {
  const categoryByName = new Map(
    (await prisma.itemCategory.findMany({ select: { id: true, name: true } })).map((row) => [
      row.name,
      row.id,
    ]),
  );
  const itemBySku = new Map(
    (await prisma.item.findMany({ select: { id: true, sku: true } })).map((row) => [
      row.sku,
      row.id,
    ]),
  );

  for (const definition of STANDARD_ITEMS) {
    if (itemBySku.has(definition.sku)) continue;

    let categoryId = categoryByName.get(definition.category);
    if (!categoryId) {
      const category = await prisma.itemCategory.create({
        data: { name: definition.category, unit: definition.unit },
      });
      categoryId = category.id;
      categoryByName.set(definition.category, categoryId);
      summary.nhomMoi += 1;
    }

    const item = await prisma.item.create({
      data: {
        categoryId,
        name: definition.name,
        sku: definition.sku,
        consumable: definition.consumable,
        unitWeightKg: definition.unitWeightKg,
      },
    });
    itemBySku.set(item.sku, item.id);
    summary.itemMoi += 1;
    console.log(`  + mặt hàng ${definition.sku} — ${definition.name}`);
  }
  return itemBySku;
}

/**
 * Tạo một lô nếu chưa có.
 *
 * Khoá nhận diện là cặp (itemId, batchCode) — đúng ràng buộc `@@unique` của
 * `ItemBatch`. Nhờ vậy chạy lại lần hai không sinh thêm lô nào, và cũng không cộng
 * dồn số lượng vào lô cũ: cộng dồn thì mỗi lần lỡ tay chạy lại là tồn kho phồng lên
 * mà không có lô nào để lần ra.
 */
async function taoLoNeuThieu(
  itemId: string,
  shelfId: string,
  batchCode: string,
  quantity: number,
  status: ItemStatus,
  condition: ItemCondition,
  expiryDate: Date | null,
  inspectedAt: Date | null,
): Promise<boolean> {
  const existing = await prisma.itemBatch.findUnique({
    where: { itemId_batchCode: { itemId, batchCode } },
    select: { id: true },
  });
  if (existing) {
    summary.boQua += 1;
    return false;
  }
  await prisma.itemBatch.create({
    data: {
      itemId,
      shelfId,
      batchCode,
      quantity,
      status,
      condition,
      circulation: "IN_STOCK",
      expiryDate,
      inspectedAt,
    },
  });
  return true;
}

async function napKhoTong(itemBySku: Map<string, string>) {
  const central = await prisma.warehouse.findFirstOrThrow({ where: { kind: "CENTRAL" } });
  const shelves = new Map(
    (
      await prisma.shelf.findMany({
        where: { zone: { warehouseId: central.id } },
        select: { id: true, code: true },
      })
    ).map((shelf) => [shelf.code, shelf.id]),
  );

  for (const definition of CENTRAL_BATCHES) {
    const itemId = itemBySku.get(definition.sku);
    const shelfId = shelves.get(definition.shelfCode);
    if (!itemId) throw new Error(`Không tìm thấy mặt hàng ${definition.sku}`);
    // Kệ thiếu thì DỪNG, không thả lô vào kệ khác: vị trí sai còn khó tìm hơn là
    // chưa nhập, và người đi lấy hàng sẽ đứng trước đúng cái kệ trống.
    if (!shelfId) throw new Error(`Kho tổng chưa có kệ ${definition.shelfCode}`);

    const created = await taoLoNeuThieu(
      itemId,
      shelfId,
      definition.batchCode,
      definition.quantity,
      legacyStatus(definition),
      definition.condition as ItemCondition,
      dateFromOffset(definition.expiryOffsetDays),
      dateFromOffset(
        definition.inspectedOffsetDays == null ? null : -definition.inspectedOffsetDays,
      ),
    );
    if (created) {
      summary.loKhoTong += 1;
      console.log(
        `  + kho tổng ${definition.batchCode}: ${definition.quantity} (kệ ${definition.shelfCode})`,
      );
    }
  }
}

async function napKhoThon(itemBySku: Map<string, string>) {
  for (let index = 0; index < HAMLET_WAREHOUSES.length; index++) {
    const definition = HAMLET_WAREHOUSES[index];
    const warehouse = await prisma.warehouse.findFirst({
      where: { name: definition.name, kind: "HAMLET" },
      select: { id: true },
    });
    if (!warehouse) {
      console.warn(`  ! bỏ qua ${definition.name}: không có trong DB`);
      continue;
    }

    // Kho thôn chỉ có đúng một kệ (zone A / shelf A1), dựng từ seed.ts.
    const shelf = await prisma.shelf.findFirst({
      where: { zone: { warehouseId: warehouse.id } },
      select: { id: true },
    });
    if (!shelf) {
      console.warn(`  ! bỏ qua ${definition.name}: chưa có kệ`);
      continue;
    }

    let added = 0;
    for (const stock of definition.stock) {
      const itemId = itemBySku.get(stock.sku);
      if (!itemId) throw new Error(`Không tìm thấy mặt hàng ${stock.sku}`);
      // Mã lô đặt y hệt seed.ts để hai đường nạp không sinh ra hai lô cho cùng
      // một thứ hàng ở cùng một kho.
      const created = await taoLoNeuThieu(
        itemId,
        shelf.id,
        `${stock.sku}-${definition.key.toUpperCase()}`,
        stock.quantity,
        ItemStatus.AVAILABLE,
        ItemCondition.NEW,
        dateFromOffset(stock.expiryOffsetDays),
        dateFromOffset(-(2 + (index % 6))),
      );
      if (created) {
        added += 1;
        summary.loKhoThon += 1;
      }
    }
    if (added > 0) console.log(`  + ${definition.name}: thêm ${added} mặt hàng`);
  }
}

async function main() {
  console.log("Bổ sung vật tư cứu trợ — chỉ thêm phần còn thiếu\n");
  console.log("Danh mục:");
  const itemBySku = await bagSungDanhMuc();
  console.log("\nKho tổng:");
  await napKhoTong(itemBySku);
  console.log("\nKho thôn:");
  await napKhoThon(itemBySku);

  console.log(
    `\nXong. Nhóm mới ${summary.nhomMoi} · mặt hàng mới ${summary.itemMoi} · ` +
      `lô kho tổng ${summary.loKhoTong} · lô kho thôn ${summary.loKhoThon} · ` +
      `đã có sẵn nên bỏ qua ${summary.boQua}.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
