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
    unit: "lít",
    name: "Nước uống đóng chai",
    sku: "WATER-01",
    consumable: true,
    unitWeightKg: 1,
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
    stock: [
      { sku: "WATER-01", quantity: 180 + tier * 30, expiryOffsetDays: 210 + tier * 15 },
      { sku: "LIFE-ADULT", quantity: 18 + tier * 4, expiryOffsetDays: null },
      { sku: "LIFE-CHILD", quantity: 8 + tier * 2, expiryOffsetDays: null },
      { sku: "FIRSTAID-01", quantity: 4 + (tier % 3), expiryOffsetDays: 240 + tier * 10 },
      { sku: "TORCH-01", quantity: 6 + tier, expiryOffsetDays: null },
      { sku: "CANVAS-01", quantity: 8 + tier * 2, expiryOffsetDays: null },
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
