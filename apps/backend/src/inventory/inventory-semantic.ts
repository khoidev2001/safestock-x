export interface CatalogTextInput {
  sku: string;
  name: string;
  categoryName: string;
  unit: string;
}

const PURPOSE_BY_SKU_PREFIX: Record<string, string> = {
  WATER: "nước sạch, uống, chứa nước, vệ sinh",
  HYGIENE: "vệ sinh cá nhân và gia đình, phòng bệnh",
  RICE: "lương thực, thực phẩm, bữa ăn",
  FOOD: "lương thực, thực phẩm, ăn liền",
  LIFE: "cứu sinh, chống đuối nước, người lớn và trẻ em",
  BOAT: "di chuyển vùng ngập, sơ tán, cứu hộ",
  ROPE: "dây cứu nạn, neo giữ, cứu hộ",
  CANVAS: "che mưa, chống thấm, chỗ ở khẩn cấp",
  BLANKET: "giữ ấm, chống lạnh, người già và trẻ em",
  MOSQUITO: "ngủ nghỉ, chống muỗi, phòng bệnh",
  FIRSTAID: "sơ cứu, y tế, băng bó vết thương",
  TORCH: "chiếu sáng khi mất điện",
  BATT: "nguồn pin cho thiết bị",
  RADIO: "liên lạc lực lượng hiện trường",
  POWERBANK: "sạc điện thoại khi mất điện",
};

/** Mô tả catalog có kiểm soát để embedding hiểu công dụng, không phụ thuộc tên ngắn. */
export function buildCatalogSemanticText(item: CatalogTextInput): string {
  const prefix = item.sku.split("-")[0]?.toUpperCase() ?? "";
  const purpose = PURPOSE_BY_SKU_PREFIX[prefix];
  return [
    `Tên vật tư: ${item.name}`,
    `Mã: ${item.sku}`,
    `Nhóm: ${item.categoryName}`,
    `Đơn vị: ${item.unit}`,
    purpose ? `Công dụng: ${purpose}` : null,
  ]
    .filter(Boolean)
    .join(". ");
}

export function lexicalCatalogScore(query: string, candidateText: string): number {
  const queryTokens = meaningfulTokens(query);
  if (queryTokens.length === 0) return 0;
  const candidate = normalize(candidateText);
  const matched = queryTokens.filter((token) => candidate.includes(token)).length;
  return matched / queryTokens.length;
}

function meaningfulTokens(value: string): string[] {
  return [...new Set(normalize(value).split(/[^a-z0-9]+/).filter((token) => token.length >= 2))];
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .toLowerCase();
}
