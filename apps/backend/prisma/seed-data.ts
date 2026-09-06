import { getAdminPinnedHamletWarehouse } from "./admin-pinned-hamlet-points";
import { getVerifiedHamletWarehouseLocation } from "./verified-warehouse-location";

export type ReliefGroup = "WASH" | "FOOD" | "RESCUE" | "SHELTER" | "HEALTH" | "COMMUNICATION";

export interface SeedItemDefinition {
  group: ReliefGroup;
  category: string;
  unit: string;
  name: string;
  sku: string;
  consumable: boolean;
  unitWeightKg: number | null;
}

export interface SeedBatchDefinition {
  sku: string;
  batchCode: string;
  shelfCode: string;
  quantity: number;
  condition: "NEW" | "USED" | "NEEDS_CHECK" | "DAMAGED";
  circulation?: "IN_STOCK" | "ON_LOAN" | "RETURNED";
  expiryOffsetDays: number | null;
  inspectedOffsetDays: number | null;
  countedOffsetDays: number | null;
  countedDelta?: number;
  shelfLocked?: boolean;
}

export interface SeedShelfDefinition {
  zoneCode: string;
  code: string;
  isLocked?: boolean;
}

export const STANDARD_ITEMS: SeedItemDefinition[] = [
  {
    group: "WASH",
    category: "Nước uống",
    // Đếm theo CHAI chứ không theo lít: kho xuất và trưởng thôn bốc từng chai,
    // không ai đong 15 lít ra khỏi kệ. Quy đổi nằm ở LITERS_PER_WATER_BOTTLE.
    unit: "chai",
    name: "Nước uống đóng chai",
    sku: "WATER-01",
    consumable: true,
    unitWeightKg: 1.5,
  },
  {
    group: "WASH",
    category: "Dụng cụ chứa nước",
    unit: "chiếc",
    name: "Can nước 20 lít",
    sku: "WATER-CAN-20L",
    consumable: false,
    unitWeightKg: 0.9,
  },
  {
    group: "WASH",
    category: "Vệ sinh gia đình",
    unit: "bộ",
    name: "Bộ vệ sinh gia đình",
    sku: "HYGIENE-KIT-01",
    consumable: true,
    unitWeightKg: 2.5,
  },
  {
    group: "FOOD",
    category: "Lương thực",
    unit: "kg",
    name: "Gạo cứu trợ",
    sku: "RICE-01",
    consumable: true,
    unitWeightKg: 1,
  },
  {
    group: "FOOD",
    category: "Lương thực",
    unit: "kg",
    name: "Lương khô cứu trợ",
    sku: "FOOD-RATION-01",
    consumable: true,
    unitWeightKg: 1,
  },
  {
    group: "RESCUE",
    category: "Thiết bị cứu sinh",
    unit: "chiếc",
    name: "Áo phao người lớn",
    sku: "LIFE-ADULT",
    consumable: false,
    unitWeightKg: 0.8,
  },
  {
    group: "RESCUE",
    category: "Thiết bị cứu sinh",
    unit: "chiếc",
    name: "Áo phao trẻ em",
    sku: "LIFE-CHILD",
    consumable: false,
    unitWeightKg: 0.5,
  },
  {
    group: "RESCUE",
    category: "Thiết bị cứu sinh",
    unit: "chiếc",
    name: "Xuồng cứu hộ",
    sku: "BOAT-01",
    consumable: false,
    unitWeightKg: 25,
  },
  {
    group: "RESCUE",
    category: "Dây cứu hộ",
    unit: "cuộn",
    name: "Dây cứu hộ 30 mét",
    sku: "ROPE-01",
    consumable: false,
    unitWeightKg: 3,
  },
  {
    group: "SHELTER",
    category: "Che chắn khẩn cấp",
    unit: "tấm",
    name: "Bạt che chống thấm",
    sku: "CANVAS-01",
    consumable: false,
    unitWeightKg: 2,
  },
  {
    group: "SHELTER",
    category: "Che chắn khẩn cấp",
    unit: "tấm",
    name: "Chăn cứu trợ",
    sku: "BLANKET-01",
    consumable: false,
    unitWeightKg: 1.4,
  },
  {
    group: "SHELTER",
    category: "Màn chống muỗi",
    unit: "chiếc",
    name: "Màn chống muỗi",
    sku: "MOSQUITO-NET-01",
    consumable: false,
    unitWeightKg: 0.6,
  },
  {
    group: "HEALTH",
    category: "Y tế sơ cấp",
    unit: "bộ",
    name: "Bộ sơ cứu",
    sku: "FIRSTAID-01",
    consumable: true,
    unitWeightKg: 1.2,
  },
  {
    group: "COMMUNICATION",
    category: "Chiếu sáng",
    unit: "chiếc",
    name: "Đèn pin",
    sku: "TORCH-01",
    consumable: false,
    unitWeightKg: 0.3,
  },
  {
    group: "COMMUNICATION",
    category: "Pin dùng một lần",
    unit: "bộ",
    name: "Bộ pin",
    sku: "BATT-01",
    consumable: true,
    unitWeightKg: 0.1,
  },
  {
    group: "COMMUNICATION",
    category: "Thông tin liên lạc",
    unit: "chiếc",
    name: "Bộ đàm cầm tay",
    sku: "RADIO-01",
    consumable: false,
    unitWeightKg: 0.4,
  },
  {
    group: "COMMUNICATION",
    category: "Nguồn điện dự phòng",
    unit: "chiếc",
    name: "Pin sạc dự phòng",
    sku: "POWERBANK-01",
    consumable: false,
    unitWeightKg: 0.35,
  },

  // ===== Bổ sung sau đợt chạy thử 20 kịch bản bão/lũ/sạt lở =====
  //
  // Chạy thử cho thấy danh mục cũ thiếu đúng những thứ trưởng thôn gọi điện xin
  // đầu tiên: ăn liền được ngay, mặc để lội nước, và dụng cụ cho đội đào bới. Mỗi
  // món dưới đây đều gắn với một tình huống có thật trong bộ kịch bản đó.

  {
    group: "FOOD",
    category: "Mì ăn liền",
    // Đếm theo THÙNG chứ không theo gói: kho bốc nguyên thùng, xe chở nguyên
    // thùng, và trưởng thôn cũng xin "mấy thùng mì" chứ không xin 300 gói. Số gói
    // ghi thẳng vào TÊN để người xuất kho khỏi phải tra ở đâu khác.
    unit: "thùng",
    name: "Mì tôm cứu trợ (thùng 30 gói)",
    sku: "NOODLE-01",
    consumable: true,
    unitWeightKg: 2.7,
  },
  {
    group: "FOOD",
    category: "Sữa cho trẻ nhỏ",
    unit: "thùng",
    name: "Sữa hộp cho trẻ em (thùng 48 hộp)",
    sku: "MILK-01",
    consumable: true,
    unitWeightKg: 9.6,
  },
  {
    group: "WASH",
    category: "Khử khuẩn nước",
    // Nước đóng chai chỉ đủ phần UỐNG. Sau lũ, nước giếng và nước bồn đều nhiễm
    // bẩn, mà chở đủ nước sinh hoạt cho cả thôn thì không xe nào tải nổi — một
    // viên xử lý được 20 lít, nhẹ và rẻ hơn chở nước gấp hàng chục lần.
    unit: "viên",
    name: "Viên khử khuẩn nước (1 viên/20 lít)",
    sku: "AQUATAB-01",
    consumable: true,
    unitWeightKg: 0.002,
  },
  {
    group: "RESCUE",
    category: "Thiết bị cứu sinh",
    unit: "chiếc",
    // Khác áo phao: phao tròn NÉM ĐƯỢC tới người đang trôi mà không cần tiếp cận.
    name: "Phao cứu sinh tròn",
    sku: "RING-01",
    consumable: false,
    unitWeightKg: 2.5,
  },
  {
    group: "RESCUE",
    category: "Dụng cụ đào bới",
    unit: "chiếc",
    name: "Xẻng xúc bùn đất",
    sku: "SHOVEL-01",
    consumable: false,
    unitWeightKg: 1.8,
  },
  {
    group: "SHELTER",
    category: "Áo mưa",
    unit: "chiếc",
    name: "Áo mưa cứu trợ",
    sku: "RAINCOAT-01",
    consumable: false,
    unitWeightKg: 0.3,
  },
  {
    group: "SHELTER",
    category: "Ủng lội nước",
    unit: "đôi",
    name: "Ủng lội nước",
    sku: "BOOT-01",
    consumable: false,
    unitWeightKg: 1.2,
  },
  {
    group: "HEALTH",
    category: "Vận chuyển người bị thương",
    unit: "chiếc",
    name: "Cáng cứu thương",
    sku: "STRETCHER-01",
    consumable: false,
    unitWeightKg: 6,
  },
  {
    group: "COMMUNICATION",
    category: "Loa thông báo",
    // Sơ tán một thôn giữa đêm mưa: không có loa thì phải gõ cửa từng nhà.
    unit: "chiếc",
    name: "Loa cầm tay",
    sku: "MEGAPHONE-01",
    consumable: false,
    unitWeightKg: 1,
  },
  {
    group: "COMMUNICATION",
    // Cùng nhóm với pin sạc dự phòng nên dùng chung đơn vị "chiếc" —
    // `validateSeedDataset` bắt lỗi nếu một nhóm dùng hai đơn vị khác nhau.
    category: "Nguồn điện dự phòng",
    unit: "chiếc",
    name: "Máy phát điện mini 2kVA",
    sku: "GENERATOR-01",
    consumable: false,
    unitWeightKg: 22,
  },
];

export const CENTRAL_SHELVES: SeedShelfDefinition[] = [
  { zoneCode: "A", code: "A1" },
  { zoneCode: "A", code: "A2" },
  { zoneCode: "B", code: "B1" },
  { zoneCode: "B", code: "B2" },
  { zoneCode: "C", code: "C1" },
  { zoneCode: "C", code: "C2" },
  { zoneCode: "C", code: "C3" },
];

export const CENTRAL_BATCHES: SeedBatchDefinition[] = [
  batch("WATER-01", "WATER-2026-01", "A1", 1200, 180, 2, 2),
  batch("WATER-01", "WATER-2026-02", "A1", 900, 300, 5, 5),
  batch("WATER-01", "WATER-2026-03", "A1", 120, 20, 1, 1),
  batch("WATER-CAN-20L", "WATERCAN-2026-01", "A1", 80, null, 10, 10),
  batch("HYGIENE-KIT-01", "HYGIENE-2026-01", "A1", 100, 540, 12, 12),
  batch("RICE-01", "RICE-2026-01", "A2", 600, 300, 3, 3),
  batch("FOOD-RATION-01", "RATION-2026-01", "A2", 300, 240, 4, 4),
  batch("LIFE-ADULT", "LIFE-A-2026-01", "B1", 120, null, 7, 7),
  batch("LIFE-CHILD", "LIFE-C-2026-01", "B1", 50, null, 7, 7),
  batch("BOAT-01", "BOAT-2026-01", "B1", 6, null, 14, 14),
  batch("ROPE-01", "ROPE-2026-01", "B1", 30, null, 8, 8),
  batch("CANVAS-01", "CANVAS-2026-01", "B2", 60, null, 6, 6),
  batch("BLANKET-01", "BLANKET-2026-01", "B2", 150, null, 9, 9),
  batch("MOSQUITO-NET-01", "MOSQUITO-2026-01", "B2", 100, null, 9, 9),
  batch("FIRSTAID-01", "FIRSTAID-2026-01", "C1", 24, 180, 2, 2),
  batch("FIRSTAID-01", "FIRSTAID-2026-02", "C1", 6, 25, 1, 1),
  batch("TORCH-01", "TORCH-2026-01", "C2", 40, null, 5, 5),
  batch("BATT-01", "BATTERY-2026-01", "C2", 120, 365, 5, 5),
  batch("RADIO-01", "RADIO-2026-01", "C2", 16, null, 3, 3),
  batch("POWERBANK-01", "POWERBANK-2026-01", "C2", 30, null, 4, 4),

  // ===== Nâng tồn kho tổng sau đợt chạy thử 20 kịch bản =====
  //
  // Bộ tồn cũ dựng cho vài chục người. Kịch bản bão Tân Bình có 1.200 người, và
  // với định mức 1 chai/người/ngày thì riêng nước đã vượt sạch 2.220 chai đang có.
  // Số dưới đây đặt theo mức một kho xã trữ được thật: đủ gánh một trận lớn hoặc
  // vài trận nhỏ cùng lúc, không phải kho tỉnh.
  //
  // Chia làm NHIỀU LÔ hạn khác nhau thay vì một lô to: FEFO mới có việc để làm, và
  // đó cũng là cách kho thật nhập hàng — mỗi đợt cấp phát một lô.
  batch("WATER-01", "WATER-2026-04", "A1", 3000, 330, 6, 6),

  // Mì tôm: thứ được xin nhiều nhất và cũng là thứ dễ trữ nhất — không cần nấu,
  // hạn dài, xếp chồng được. Nhiều thùng là đúng thực tế kho xã mùa mưa bão.
  batch("NOODLE-01", "NOODLE-2026-01", "A2", 1200, 240, 3, 3),
  batch("NOODLE-01", "NOODLE-2026-02", "A2", 900, 150, 8, 8),
  batch("RICE-01", "RICE-2026-02", "A2", 2000, 270, 6, 6),
  batch("FOOD-RATION-01", "RATION-2026-02", "A2", 900, 300, 5, 5),
  batch("MILK-01", "MILK-2026-01", "A2", 240, 200, 4, 4),

  batch("AQUATAB-01", "AQUATAB-2026-01", "A1", 20000, 600, 9, 9),
  batch("HYGIENE-KIT-01", "HYGIENE-2026-02", "A1", 300, 540, 11, 11),

  // XUỒNG GIỮ ÍT — có chủ ý. Một chiếc chiếm chỗ bằng cả trăm thùng mì, mà một
  // nhiệm vụ cũng chỉ dùng vài chiếc: xuồng chở người ra vào nhiều lượt chứ không
  // phát cho từng người như áo phao. Trữ nhiều là chiếm hết chỗ của thứ dùng hằng
  // ngày. 12 chiếc ở kho tổng + mỗi thôn 1 chiếc là đủ cho vài điểm ngập cùng lúc.
  batch("BOAT-01", "BOAT-2026-02", "B1", 6, null, 14, 14),
  batch("LIFE-ADULT", "LIFE-A-2026-02", "B1", 380, null, 9, 9),
  batch("LIFE-CHILD", "LIFE-C-2026-02", "B1", 150, null, 9, 9),
  batch("RING-01", "RING-2026-01", "B1", 60, null, 10, 10),
  batch("ROPE-01", "ROPE-2026-02", "B1", 40, null, 10, 10),

  batch("CANVAS-01", "CANVAS-2026-02", "B2", 240, null, 7, 7),
  batch("BLANKET-01", "BLANKET-2026-02", "B2", 250, null, 10, 10),
  batch("MOSQUITO-NET-01", "MOSQUITO-2026-02", "B2", 200, null, 10, 10),
  batch("RAINCOAT-01", "RAINCOAT-2026-01", "B2", 900, null, 5, 5),
  batch("BOOT-01", "BOOT-2026-01", "B2", 320, null, 5, 5),

  batch("FIRSTAID-01", "FIRSTAID-2026-03", "C1", 120, 300, 3, 3),
  batch("STRETCHER-01", "STRETCHER-2026-01", "C1", 20, null, 12, 12),

  batch("TORCH-01", "TORCH-2026-02", "C2", 160, null, 6, 6),
  batch("BATT-01", "BATTERY-2026-02", "C2", 400, 500, 6, 6),
  batch("RADIO-01", "RADIO-2026-02", "C2", 24, null, 6, 6),
  batch("POWERBANK-01", "POWERBANK-2026-02", "C2", 90, null, 6, 6),
  batch("MEGAPHONE-01", "MEGAPHONE-2026-01", "C2", 14, null, 7, 7),

  // Kệ C3 tới giờ vẫn trống — dành cho đồ cồng kềnh, nặng, ít lượt xuất.
  batch("SHOVEL-01", "SHOVEL-2026-01", "C3", 140, null, 13, 13),
  batch("GENERATOR-01", "GENERATOR-2026-01", "C3", 4, null, 13, 13),
  batch("FIRSTAID-01", "FIRSTAID-EXPIRED-01", "C3", 4, -10, 40, 40, "NEEDS_CHECK"),
  batch("CANVAS-01", "CANVAS-DAMAGED-01", "C3", 6, null, 20, 20, "DAMAGED"),
  batch("CANVAS-01", "CANVAS-CHECK-01", "C3", 8, null, 35, 35, "NEEDS_CHECK"),
  batch("RADIO-01", "RADIO-CHECK-01", "C3", 4, null, 32, 32, "NEEDS_CHECK"),
];

// Danh sách sau sắp xếp thôn được xã Đồng Xuân công bố ngày 01/07/2026.
// Chỉ 5 Nhà văn hóa đã xác minh được seed tọa độ; 12 điểm còn lại chờ ADMIN ghim.
export const HAMLET_WAREHOUSES = [
  ["long-chau", "Long Châu"],
  ["long-thang", "Long Thăng"],
  ["long-ha", "Long Hà"],
  ["long-binh", "Long Bình"],
  ["long-my", "Long Mỹ"],
  ["long-thach", "Long Thạch"],
  ["long-hoa", "Long Hòa"],
  ["ky-du", "Kỳ Đu"],
  ["phuoc-hue", "Phước Huệ"],
  ["tan-binh", "Tân Bình"],
  ["tan-an", "Tân An"],
  ["tan-hoa", "Tân Hòa"],
  ["tan-phuoc", "Tân Phước"],
  ["tan-phu", "Tân Phú"],
  ["tan-vinh", "Tân Vinh"],
  ["phu-son", "Phú Sơn"],
  ["triem-duc", "Triêm Đức"],
].map(([key, hamletName], index) => createHamletWarehouse(key, hamletName, index));

export function validateSeedDataset(): string[] {
  const errors: string[] = [];
  findDuplicates(STANDARD_ITEMS.map((item) => item.sku)).forEach((sku) =>
    errors.push(`SKU trùng: ${sku}`),
  );
  findDuplicates(CENTRAL_BATCHES.map((batch) => batch.batchCode)).forEach((code) =>
    errors.push(`Mã lô trùng: ${code}`),
  );
  findDuplicates(HAMLET_WAREHOUSES.map((warehouse) => warehouse.key)).forEach((key) =>
    errors.push(`Mã kho thôn trùng: ${key}`),
  );
  findDuplicates(HAMLET_WAREHOUSES.map((warehouse) => warehouse.name)).forEach((name) =>
    errors.push(`Tên kho thôn trùng: ${name}`),
  );

  const categoryUnits = new Map<string, string>();
  for (const item of STANDARD_ITEMS) {
    const existingUnit = categoryUnits.get(item.category);
    if (existingUnit && existingUnit !== item.unit) {
      errors.push(`Nhóm ${item.category} dùng nhiều đơn vị: ${existingUnit}, ${item.unit}`);
    }
    categoryUnits.set(item.category, item.unit);
  }

  const skus = new Set(STANDARD_ITEMS.map((item) => item.sku));
  const shelfCodes = new Set(CENTRAL_SHELVES.map((shelf) => shelf.code));
  for (const batch of CENTRAL_BATCHES) {
    if (!skus.has(batch.sku)) errors.push(`Lô ${batch.batchCode} dùng SKU không tồn tại`);
    if (!shelfCodes.has(batch.shelfCode))
      errors.push(`Lô ${batch.batchCode} dùng kệ không tồn tại`);
    if (batch.quantity < 0) errors.push(`Lô ${batch.batchCode} có số lượng âm`);
  }
  for (const warehouse of HAMLET_WAREHOUSES) {
    if ((warehouse.lat == null) !== (warehouse.lng == null)) {
      errors.push(`${warehouse.name} thiếu một phần tọa độ`);
    }
    if (warehouse.locationVerified !== (warehouse.lat != null && warehouse.lng != null)) {
      errors.push(`${warehouse.name} có trạng thái xác minh không khớp tọa độ`);
    }
    for (const stock of warehouse.stock) {
      if (!skus.has(stock.sku))
        errors.push(`${warehouse.name} dùng SKU không tồn tại: ${stock.sku}`);
      if (stock.quantity < 0) errors.push(`${warehouse.name} có số lượng âm: ${stock.sku}`);
    }
  }
  return errors;
}

function createHamletWarehouse(key: string, hamletName: string, index: number) {
  const tier = index % 5;
  const verifiedLocation = getVerifiedHamletWarehouseLocation(key);
  // Maps không tra ra thì lấy điểm ADMIN đã ghim tay và xác nhận với địa phương.
  const adminPinned = verifiedLocation ? null : getAdminPinnedHamletWarehouse(key);
  return {
    key,
    name: `Kho thôn ${hamletName}`,
    // Tên thôn trần, tách khỏi tên kho: điểm ứng phó (Hamlet) là "Phú Sơn", còn kho
    // đặt tại đó mới là "Kho thôn Phú Sơn". Người báo tình huống nói tên thôn.
    hamletName,
    location: verifiedLocation?.name ?? `Nhà văn hóa thôn ${hamletName}`,
    locationVerified: verifiedLocation != null || adminPinned != null,
    lat: verifiedLocation?.lat ?? adminPinned?.lat ?? null,
    lng: verifiedLocation?.lng ?? adminPinned?.lng ?? null,
    // Kho thôn là ĐIỂM CẦM CỰ 24-48 GIỜ ĐẦU, không phải kho thu nhỏ của kho tổng.
    //
    // Ý nghĩa của nó nằm ở chỗ đường tới đây ngắn: lũ lên, cầu ngập, xe từ kho tổng
    // chưa vào được thì thôn vẫn tự phát được cơm nước và áo phao cho dân mình. Nên
    // số ở đây tính theo "một thôn vài trăm dân cầm cự tới khi xe vào được", còn
    // phần gánh cả trận thì để kho tổng.
    //
    // `tier` cho các thôn lệch nhau chút ít — thôn to thôn nhỏ khác nhau thật, và
    // dữ liệu đều tăm tắp thì không lộ ra được lỗi phân bổ giữa các kho.
    stock: [
      // Ăn, uống: giữ được lâu, dùng hằng ngày, cần nhất và cũng dễ trữ nhất.
      { sku: "WATER-01", quantity: 180 + tier * 30, expiryOffsetDays: 210 + tier * 15 },
      { sku: "NOODLE-01", quantity: 70 + tier * 20, expiryOffsetDays: 200 + tier * 20 },
      { sku: "RICE-01", quantity: 150 + tier * 50, expiryOffsetDays: 260 + tier * 15 },
      { sku: "FOOD-RATION-01", quantity: 40 + tier * 15, expiryOffsetDays: 220 + tier * 20 },
      { sku: "MILK-01", quantity: 8 + tier * 2, expiryOffsetDays: 180 + tier * 10 },
      { sku: "AQUATAB-01", quantity: 400 + tier * 150, expiryOffsetDays: 540 + tier * 20 },
      { sku: "WATER-CAN-20L", quantity: 10 + tier * 3, expiryOffsetDays: null },
      { sku: "HYGIENE-KIT-01", quantity: 12 + tier * 4, expiryOffsetDays: 480 + tier * 20 },

      // Cứu sinh. Xuồng ĐÚNG MỘT CHIẾC mỗi thôn: chỗ để ở nhà văn hoá chỉ có vậy,
      // và một chiếc chạy nhiều lượt vẫn hơn hẳn không có chiếc nào lúc nước lên.
      { sku: "LIFE-ADULT", quantity: 18 + tier * 4, expiryOffsetDays: null },
      { sku: "LIFE-CHILD", quantity: 8 + tier * 2, expiryOffsetDays: null },
      { sku: "BOAT-01", quantity: 1, expiryOffsetDays: null },
      { sku: "RING-01", quantity: 4 + tier, expiryOffsetDays: null },
      { sku: "ROPE-01", quantity: 3 + tier, expiryOffsetDays: null },
      { sku: "SHOVEL-01", quantity: 6 + tier * 2, expiryOffsetDays: null },

      // Che chắn, mặc để lội nước.
      { sku: "CANVAS-01", quantity: 8 + tier * 2, expiryOffsetDays: null },
      { sku: "BLANKET-01", quantity: 20 + tier * 6, expiryOffsetDays: null },
      { sku: "MOSQUITO-NET-01", quantity: 15 + tier * 5, expiryOffsetDays: null },
      { sku: "RAINCOAT-01", quantity: 40 + tier * 15, expiryOffsetDays: null },
      { sku: "BOOT-01", quantity: 12 + tier * 4, expiryOffsetDays: null },

      // Y tế và liên lạc — thứ phải có sẵn TẠI CHỖ, chờ xe chở tới là muộn.
      { sku: "FIRSTAID-01", quantity: 4 + (tier % 3), expiryOffsetDays: 240 + tier * 10 },
      { sku: "STRETCHER-01", quantity: 1 + (tier % 2), expiryOffsetDays: null },
      { sku: "TORCH-01", quantity: 6 + tier, expiryOffsetDays: null },
      { sku: "BATT-01", quantity: 24 + tier * 6, expiryOffsetDays: 400 + tier * 20 },
      { sku: "RADIO-01", quantity: 2, expiryOffsetDays: null },
      { sku: "POWERBANK-01", quantity: 4 + tier, expiryOffsetDays: null },
      { sku: "MEGAPHONE-01", quantity: 1, expiryOffsetDays: null },
    ],
  };
}

function batch(
  sku: string,
  batchCode: string,
  shelfCode: string,
  quantity: number,
  expiryOffsetDays: number | null,
  inspectedOffsetDays: number | null,
  countedOffsetDays: number | null,
  condition: SeedBatchDefinition["condition"] = "NEW",
): SeedBatchDefinition {
  return {
    sku,
    batchCode,
    shelfCode,
    quantity,
    condition,
    expiryOffsetDays,
    inspectedOffsetDays,
    countedOffsetDays,
  };
}

function findDuplicates(values: string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates];
}
