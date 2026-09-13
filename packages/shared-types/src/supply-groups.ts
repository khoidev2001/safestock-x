/**
 * Nhóm vật tư cứu trợ — gom danh mục vật tư thành vài nhóm lớn để người trực đọc.
 *
 * Không dùng thẳng `ItemCategory` trong cơ sở dữ liệu: bảng đó chia tới hơn hai
 * chục loại và chia không đều ("Mì ăn liền" đứng riêng khỏi "Lương thực", "Pin
 * dùng một lần" tách khỏi "Nguồn điện dự phòng"). Bảng nhu cầu mười mấy dòng mà
 * gần như mỗi dòng một tiêu đề nhóm thì chẳng gom được gì. Người duyệt phương án
 * hỏi theo nhóm lớn — "đồ ăn đủ chưa, đồ cứu sinh đủ chưa" — nên nhóm theo đúng
 * câu hỏi đó, bám theo cách kho xếp khu A/B/C.
 *
 * Dùng chung ở gói này để web, điện thoại và bản in xếp cùng một thứ tự.
 */

export type SupplyGroup =
  "FOOD" | "WATER_HYGIENE" | "LIFESAVING" | "SHELTER" | "MEDICAL" | "POWER_COMMS" | "OTHER";

/** Thứ tự nhóm trên màn hình: sống còn trước (ăn uống, cứu sinh), hậu cần sau. */
export const SUPPLY_GROUP_ORDER: readonly SupplyGroup[] = [
  "FOOD",
  "WATER_HYGIENE",
  "LIFESAVING",
  "SHELTER",
  "MEDICAL",
  "POWER_COMMS",
  "OTHER",
];

export const SUPPLY_GROUP_LABELS: Readonly<Record<SupplyGroup, string>> = {
  FOOD: "Lương thực",
  WATER_HYGIENE: "Nước uống và vệ sinh",
  LIFESAVING: "Cứu sinh và cứu hộ",
  SHELTER: "Che chắn và giữ ấm",
  MEDICAL: "Y tế",
  POWER_COMMS: "Chiếu sáng, điện và liên lạc",
  OTHER: "Vật tư khác",
};

const SUPPLY_GROUP_BY_SKU: Readonly<Record<string, SupplyGroup>> = {
  "RICE-01": "FOOD",
  "FOOD-RATION-01": "FOOD",
  "NOODLE-01": "FOOD",
  "MILK-01": "FOOD",

  "WATER-01": "WATER_HYGIENE",
  "WATER-CAN-20L": "WATER_HYGIENE",
  "AQUATAB-01": "WATER_HYGIENE",
  "HYGIENE-KIT-01": "WATER_HYGIENE",

  "LIFE-ADULT": "LIFESAVING",
  "LIFE-CHILD": "LIFESAVING",
  "BOAT-01": "LIFESAVING",
  "RING-01": "LIFESAVING",
  "ROPE-01": "LIFESAVING",
  "SHOVEL-01": "LIFESAVING",
  "BOOT-01": "LIFESAVING",

  "CANVAS-01": "SHELTER",
  "BLANKET-01": "SHELTER",
  "MOSQUITO-NET-01": "SHELTER",
  "RAINCOAT-01": "SHELTER",

  "FIRSTAID-01": "MEDICAL",
  "STRETCHER-01": "MEDICAL",

  "TORCH-01": "POWER_COMMS",
  "BATT-01": "POWER_COMMS",
  "RADIO-01": "POWER_COMMS",
  "POWERBANK-01": "POWER_COMMS",
  "MEGAPHONE-01": "POWER_COMMS",
  "GENERATOR-01": "POWER_COMMS",
};

/** SKU chưa có trong bảng (danh mục mở rộng sau này) rơi vào "Vật tư khác", không mất dòng. */
export function supplyGroupOf(sku: string): SupplyGroup {
  return SUPPLY_GROUP_BY_SKU[sku] ?? "OTHER";
}

/**
 * Xếp lại danh sách theo nhóm, GIỮ NGUYÊN thứ tự gốc trong từng nhóm.
 *
 * Phải xếp TRƯỚC khi cắt trang: cắt trước rồi mới gom thì cùng một nhóm lại nằm
 * rải ở cả trang 1 lẫn trang 2 xen giữa các nhóm khác.
 */
export function sortBySupplyGroup<T>(items: readonly T[], skuOf: (item: T) => string): T[] {
  return items
    .map((item, index) => ({
      item,
      index,
      rank: SUPPLY_GROUP_ORDER.indexOf(supplyGroupOf(skuOf(item))),
    }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(({ item }) => item);
}

/**
 * Gom các dòng LIỀN NHAU cùng nhóm thành từng khối, để vẽ một tiêu đề nhóm rồi tới
 * các dòng của nó. Nhận danh sách đã xếp bằng `sortBySupplyGroup` (thường là một
 * trang đã cắt), nên chỉ cần so với dòng ngay trước.
 */
export function chunkBySupplyGroup<T>(
  items: readonly T[],
  skuOf: (item: T) => string,
): { group: SupplyGroup; label: string; items: T[] }[] {
  const chunks: { group: SupplyGroup; label: string; items: T[] }[] = [];
  for (const item of items) {
    const group = supplyGroupOf(skuOf(item));
    const last = chunks[chunks.length - 1];
    if (last && last.group === group) last.items.push(item);
    else chunks.push({ group, label: SUPPLY_GROUP_LABELS[group], items: [item] });
  }
  return chunks;
}
