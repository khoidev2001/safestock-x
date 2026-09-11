/**
 * Nạp hàng cho kho của xã lân cận, để luồng mượn liên xã có gì mà mượn.
 *
 * VÌ SAO CẦN
 *
 * Kho Xuân Thọ do script đời trước dựng nên chỉ có ĐÚNG BA mã hàng. Mọi nhiệm vụ
 * thật đều thiếu những mã khác, nên bấm "Mượn xã khác" là gặp câu
 * "Kho không còn lô nào của vật tư ..." — hệ thống chặn đúng, nhưng người xem thì
 * thấy như tính năng hỏng.
 *
 * Nặng hơn: bảng định mức ở `mission.config.ts` đòi 9 mã CHƯA HỀ có trong danh
 * mục `Item` (RING-01, AQUATAB-01, NOODLE-01...). Không xã nào đáp ứng nổi, vì
 * không có gì để đáp ứng — con số "thiếu" ấy là vĩnh viễn, không phải do kho nghèo.
 * Nên bước một ở đây là tạo cho đủ danh mục, rồi mới nói tới chuyện nạp hàng.
 *
 * NGUYÊN TẮC
 *
 * - Chạy lại bao nhiêu lần cũng được: có rồi thì cập nhật, chưa có thì tạo.
 * - KHÔNG đụng tới tồn kho Đồng Xuân. Xã nhà phải còn thiếu vài thứ thì việc mượn
 *   liên xã mới có lý do tồn tại; nạp đầy cả hai bên là xoá mất chính tính năng
 *   đang muốn trình bày.
 * - Số lượng KHÁC NHAU giữa các mã, có mã cố ý để ít. Xã nào cũng dư dả thì ca
 *   đáng quan tâm nhất — hỏi mượn mà bên kia cũng không đủ — không bao giờ xảy ra.
 *
 * Chạy: pnpm --filter @safestock/backend exec ts-node prisma/stock-peer-commune-warehouse.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/** Đơn vị của xã lân cận cần nạp hàng. */
const PEER_ORGANIZATION_ID = "org-xuan-tho";

/**
 * Chín mã vật tư mà bảng định mức đòi nhưng danh mục chưa có.
 *
 * Tên và đơn vị chép ĐÚNG từ `mission.config.ts`: hai nơi lệch nhau một chữ là
 * bảng nhu cầu hiện hai dòng cho cùng một món.
 *
 * `consumable` theo đúng quy ước sẵn có: hàng phát đi rồi thôi là `true`; hàng
 * cho mượn rồi thu về là `false` — cờ này quyết định lúc xuất kho có sinh phiếu
 * mượn hay không, đặt sai là sổ sách sai theo.
 */
const MISSING_CATALOGUE_ITEMS = [
  { sku: "NOODLE-01", name: "Mì tôm cứu trợ", unit: "thùng", category: "Lương thực", consumable: true },
  { sku: "MILK-01", name: "Sữa hộp cho trẻ em", unit: "thùng", category: "Lương thực", consumable: true },
  { sku: "AQUATAB-01", name: "Viên khử khuẩn nước", unit: "viên", category: "Nước uống", consumable: true },
  { sku: "RAINCOAT-01", name: "Áo mưa cứu trợ", unit: "chiếc", category: "Che chắn khẩn cấp", consumable: true },
  { sku: "RING-01", name: "Phao cứu sinh tròn", unit: "chiếc", category: "Thiết bị cứu sinh", consumable: false },
  { sku: "STRETCHER-01", name: "Cáng cứu thương", unit: "chiếc", category: "Y tế sơ cấp", consumable: false },
  { sku: "MEGAPHONE-01", name: "Loa cầm tay", unit: "chiếc", category: "Thông tin liên lạc", consumable: false },
  { sku: "SHOVEL-01", name: "Xẻng xúc bùn đất", unit: "chiếc", category: "Dụng cụ cứu hộ", consumable: false },
  { sku: "BOOT-01", name: "Ủng lội nước", unit: "đôi", category: "Dụng cụ cứu hộ", consumable: false },
];

/** Khu và kệ của kho xã lân cận, đặt theo cùng lối chia nhóm như kho Đồng Xuân. */
const ZONE_LAYOUT = [
  { code: "A", name: "Nước sạch và lương thực", shelves: ["A1", "A2"] },
  { code: "B", name: "Cứu sinh và che chắn", shelves: ["B1", "B2"] },
  { code: "C", name: "Y tế, điện và liên lạc", shelves: ["C1", "C2"] },
];

/**
 * Hàng nạp cho xã lân cận: mã, kệ đặt, số lượng.
 *
 * Nhiều hơn hẳn ở những mã mà xã nhà hay thiếu trong một trận lũ (phao tròn, viên
 * khử khuẩn, mì tôm, áo mưa, loa) — đó là các mã sẽ được hỏi mượn thật.
 *
 * Cố ý để BỐN mã ở mức mỏng (xuồng, cáng, bộ đàm, pin sạc): hỏi mượn số lớn thì
 * xã bạn cũng chỉ đáp ứng được một phần. Đó là tình huống thật hay gặp nhất, và
 * là thứ đáng cho người xem thấy.
 */
const PEER_STOCK = [
  // Khu A — nước sạch và lương thực
  { sku: "WATER-01", shelf: "A1", quantity: 900 },
  { sku: "AQUATAB-01", shelf: "A1", quantity: 2400 },
  { sku: "WATER-CAN-20L", shelf: "A1", quantity: 140 },
  { sku: "RICE-01", shelf: "A2", quantity: 480 },
  { sku: "NOODLE-01", shelf: "A2", quantity: 90 },
  { sku: "FOOD-RATION-01", shelf: "A2", quantity: 260 },
  { sku: "MILK-01", shelf: "A2", quantity: 45 },

  // Khu B — cứu sinh và che chắn
  { sku: "LIFE-ADULT", shelf: "B1", quantity: 520 },
  { sku: "LIFE-CHILD", shelf: "B1", quantity: 180 },
  { sku: "RING-01", shelf: "B1", quantity: 75 },
  { sku: "ROPE-01", shelf: "B1", quantity: 40 },
  { sku: "BOAT-01", shelf: "B1", quantity: 3 }, // mỏng có chủ ý
  { sku: "CANVAS-01", shelf: "B2", quantity: 210 },
  { sku: "BLANKET-01", shelf: "B2", quantity: 240 },
  { sku: "RAINCOAT-01", shelf: "B2", quantity: 300 },
  { sku: "MOSQUITO-NET-01", shelf: "B2", quantity: 160 },
  { sku: "BOOT-01", shelf: "B2", quantity: 60 },

  // Khu C — y tế, điện và liên lạc
  { sku: "FIRSTAID-01", shelf: "C1", quantity: 500 },
  { sku: "HYGIENE-KIT-01", shelf: "C1", quantity: 190 },
  { sku: "STRETCHER-01", shelf: "C1", quantity: 4 }, // mỏng có chủ ý
  { sku: "SHOVEL-01", shelf: "C1", quantity: 35 },
  { sku: "TORCH-01", shelf: "C2", quantity: 220 },
  { sku: "BATT-01", shelf: "C2", quantity: 400 },
  { sku: "MEGAPHONE-01", shelf: "C2", quantity: 12 },
  { sku: "RADIO-01", shelf: "C2", quantity: 8 }, // mỏng có chủ ý
  { sku: "POWERBANK-01", shelf: "C2", quantity: 6 }, // mỏng có chủ ý
];

async function main() {
  // --- Bước 1: bù cho đủ danh mục vật tư mà định mức đòi.
  let categoriesCreated = 0;
  let itemsCreated = 0;
  for (const spec of MISSING_CATALOGUE_ITEMS) {
    let category = await prisma.itemCategory.findUnique({ where: { name: spec.category } });
    if (!category) {
      category = await prisma.itemCategory.create({
        data: { name: spec.category, unit: spec.unit },
      });
      categoriesCreated += 1;
    }
    const existing = await prisma.item.findUnique({ where: { sku: spec.sku } });
    if (existing) continue;
    // `Item` KHÔNG có cột `unit`: đơn vị mặc định nằm ở nhóm, còn đơn vị hiển thị
    // trong bảng nhu cầu do `mission.config.ts` cấp. Nên `spec.unit` ở đây chỉ
    // dùng để đặt đơn vị cho nhóm mới sinh ra.
    await prisma.item.create({
      data: {
        sku: spec.sku,
        name: spec.name,
        consumable: spec.consumable,
        categoryId: category.id,
      },
    });
    itemsCreated += 1;
  }
  console.log(`Danh muc: them ${itemsCreated} vat tu, ${categoriesCreated} nhom moi.`);

  // --- Bước 2: dựng khu và kệ cho kho xã lân cận.
  const warehouse = await prisma.warehouse.findFirst({
    where: { organizationId: PEER_ORGANIZATION_ID },
    select: { id: true, name: true },
  });
  if (!warehouse) {
    throw new Error(`Khong tim thay kho nao cua don vi ${PEER_ORGANIZATION_ID}.`);
  }

  const shelfIdByCode = new Map<string, string>();
  for (const zoneSpec of ZONE_LAYOUT) {
    const zone = await prisma.warehouseZone.upsert({
      where: { warehouseId_code: { warehouseId: warehouse.id, code: zoneSpec.code } },
      update: { name: zoneSpec.name },
      create: { warehouseId: warehouse.id, code: zoneSpec.code, name: zoneSpec.name },
    });
    for (const shelfCode of zoneSpec.shelves) {
      const shelf = await prisma.shelf.upsert({
        where: { zoneId_code: { zoneId: zone.id, code: shelfCode } },
        update: {},
        create: { zoneId: zone.id, code: shelfCode },
      });
      shelfIdByCode.set(shelfCode, shelf.id);
    }
  }
  console.log(`Kho "${warehouse.name}": ${ZONE_LAYOUT.length} khu, ${shelfIdByCode.size} ke.`);

  // --- Bước 3: nạp hàng.
  //
  // Tìm lô theo `batchCode` chứ không xoá sạch rồi tạo lại: xoá lô là cuốn theo
  // mọi giao dịch và mọi khoản mượn đang trỏ vào nó.
  let batchesCreated = 0;
  let batchesUpdated = 0;
  for (const row of PEER_STOCK) {
    const item = await prisma.item.findUnique({ where: { sku: row.sku }, select: { id: true } });
    if (!item) {
      console.warn(`  BO QUA ${row.sku}: khong co trong danh muc.`);
      continue;
    }
    const shelfId = shelfIdByCode.get(row.shelf);
    if (!shelfId) throw new Error(`Khong tim thay ke ${row.shelf}.`);

    const batchCode = `${row.sku}-XUAN-THO`;
    const existing = await prisma.itemBatch.findFirst({
      where: { batchCode, itemId: item.id },
      select: { id: true },
    });
    if (existing) {
      await prisma.itemBatch.update({
        where: { id: existing.id },
        data: { quantity: row.quantity, shelfId },
      });
      batchesUpdated += 1;
    } else {
      await prisma.itemBatch.create({
        data: { itemId: item.id, shelfId, batchCode, quantity: row.quantity },
      });
      batchesCreated += 1;
    }
  }
  console.log(`Ton kho: tao ${batchesCreated} lo, cap nhat ${batchesUpdated} lo.`);

  // --- Đối chiếu: đếm lại từ cơ sở dữ liệu, không tin vào bộ đếm ở trên.
  const tonKho = await prisma.itemBatch.findMany({
    where: { shelf: { zone: { warehouseId: warehouse.id } }, circulation: "IN_STOCK" },
    select: { quantity: true, item: { select: { sku: true } } },
  });
  const tongSoMa = new Set(tonKho.map((b) => b.item.sku)).size;
  const tongSoLuong = tonKho.reduce((sum, b) => sum + b.quantity, 0);
  console.log(`Doi chieu: kho xa ban co ${tongSoMa} ma hang, tong ${tongSoLuong} don vi.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
