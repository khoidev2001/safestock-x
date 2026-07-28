import { normalizeHamletName } from "../src/admin/hamlet-normalization";

export interface HamletWarehouseSource {
  organizationId: string;
  communeId: string;
  name: string;
}

export function hamletSeedFromWarehouse(source: HamletWarehouseSource) {
  const name = source.name.replace(/^Kho\s+thôn\s+/iu, "").trim();
  const normalizedName = normalizeHamletName(name);
  if (!normalizedName) {
    throw new Error(`Không chuẩn hóa được tên kho thôn: ${source.name}`);
  }

  return {
    organizationId: source.organizationId,
    communeId: source.communeId,
    name,
    normalizedName,
    aliases: [normalizedName],
    lat: null,
    lng: null,
    verified: false,
  };
}
