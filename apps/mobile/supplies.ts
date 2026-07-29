/**
 * Nhận diện nhanh vật tư cứu trợ: icon + màu nhóm cho từng SKU.
 * Mục tiêu — trong tình huống cấp bách, Lực lượng hiện trường liếc là biết ngay
 * "cái gì, thuộc nhóm nào, đủ hay thiếu".
 */

export interface SupplyMeta {
  icon: string;
  /** Màu nền ô icon (đậm, theo nhóm chức năng). */
  tint: string;
  /** Nhãn nhóm ngắn hiển thị dưới tên. */
  group: string;
}

/** Màu theo nhóm chức năng — nhất quán để mắt gom nhóm nhanh. */
const GROUP = {
  water: { tint: "#0e7490", group: "Nước uống" }, // cyan
  food: { tint: "#b45309", group: "Lương thực" }, // amber đậm
  rescue: { tint: "#c2410c", group: "Cứu hộ" }, // cam
  medical: { tint: "#b91c1c", group: "Y tế" }, // đỏ
  shelter: { tint: "#15803d", group: "Trú ẩn" }, // xanh lá
  tool: { tint: "#4338ca", group: "Thiết bị" }, // indigo
  hygiene: { tint: "#0f766e", group: "Vệ sinh" }, // teal
};

/** Map trực tiếp theo SKU (chính xác nhất). */
const BY_SKU: Record<string, SupplyMeta> = {
  "WATER-01": { icon: "💧", ...GROUP.water },
  "WATER-CAN-20L": { icon: "🪣", ...GROUP.water },
  "RICE-01": { icon: "🍚", ...GROUP.food },
  "FOOD-RATION-01": { icon: "🍱", ...GROUP.food },
  "LIFE-ADULT": { icon: "🦺", ...GROUP.rescue },
  "LIFE-CHILD": { icon: "🦺", ...GROUP.rescue },
  "BOAT-01": { icon: "🛟", ...GROUP.rescue },
  "ROPE-01": { icon: "🪢", ...GROUP.rescue },
  "FIRSTAID-01": { icon: "🩹", ...GROUP.medical },
  "CANVAS-01": { icon: "⛺", ...GROUP.shelter },
  "BLANKET-01": { icon: "🛏️", ...GROUP.shelter },
  "MOSQUITO-NET-01": { icon: "🦟", ...GROUP.shelter },
  "HYGIENE-KIT-01": { icon: "🧼", ...GROUP.hygiene },
  "TORCH-01": { icon: "🔦", ...GROUP.tool },
  "BATT-01": { icon: "🔋", ...GROUP.tool },
  "RADIO-01": { icon: "📻", ...GROUP.tool },
};

/** Dự phòng khi SKU lạ: đoán theo từ khóa trong tên. */
function guessByName(name: string): SupplyMeta {
  const n = name.toLowerCase();
  if (/(nước|water)/.test(n)) return { icon: "💧", ...GROUP.water };
  if (/(gạo|lương|thực phẩm|food|mì|lương khô)/.test(n)) return { icon: "🍚", ...GROUP.food };
  if (/(áo phao|phao|xuồng|thuyền|dây|cứu sinh)/.test(n)) return { icon: "🦺", ...GROUP.rescue };
  if (/(sơ cứu|thuốc|y tế|băng|first aid)/.test(n)) return { icon: "🩹", ...GROUP.medical };
  if (/(chăn|bạt|màn|lều|trú)/.test(n)) return { icon: "⛺", ...GROUP.shelter };
  if (/(vệ sinh|xà phòng|hygiene)/.test(n)) return { icon: "🧼", ...GROUP.hygiene };
  if (/(đèn|pin|đàm|radio|thiết bị)/.test(n)) return { icon: "🔦", ...GROUP.tool };
  return { icon: "📦", tint: "#475569", group: "Vật tư" };
}

/** Icon + màu + nhóm cho một dòng vật tư. Ưu tiên SKU, sau đó đoán theo tên. */
export function supplyOf(sku: string, name: string): SupplyMeta {
  return BY_SKU[sku?.toUpperCase?.() ?? ""] ?? guessByName(name ?? "");
}

export type SupplyStatus = "FULL" | "PARTIAL" | "MISSING";

export interface SupplyProgress {
  status: SupplyStatus;
  /** Tỉ lệ cấp được 0..1 (đã kẹp trong khoảng). */
  ratio: number;
  /** Màu thanh tiến độ / badge theo mức đáp ứng. */
  color: string;
  label: string;
}

/** Đánh giá mức đáp ứng của 1 dòng vật tư từ required/allocated. */
export function supplyProgress(required: number, allocated: number): SupplyProgress {
  const req = Math.max(0, required);
  const got = Math.max(0, allocated);
  const ratio = req === 0 ? 1 : Math.min(1, got / req);

  if (got >= req && req > 0) {
    return { status: "FULL", ratio: 1, color: "#22c55e", label: "Đủ" };
  }
  if (got <= 0) {
    return { status: "MISSING", ratio: 0, color: "#ef4444", label: "Chưa có" };
  }
  return { status: "PARTIAL", ratio, color: "#f59e0b", label: "Thiếu" };
}
