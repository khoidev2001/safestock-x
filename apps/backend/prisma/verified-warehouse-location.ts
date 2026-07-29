import type {
  VerifiedLocationKind,
  VerifiedWarehouseLocation,
} from "@safestock/shared-types";

export type { VerifiedWarehouseLocation } from "@safestock/shared-types";

export const VERIFIED_WAREHOUSE_LOCATION_REGISTRY_VERSION = "2026-07-28" as const;

function verifiedLocation<Kind extends VerifiedLocationKind>(
  definition: Omit<VerifiedWarehouseLocation<Kind>, "verificationStatus" | "verifiedAt">,
): VerifiedWarehouseLocation<Kind> {
  return {
    ...definition,
    verificationStatus: "MAP_VERIFIED",
    verifiedAt: VERIFIED_WAREHOUSE_LOCATION_REGISTRY_VERSION,
  };
}

export const VERIFIED_COMMUNE_REFERENCE_POINTS: Record<
  string,
  VerifiedWarehouseLocation<"COMMUNE_PEOPLES_COMMITTEE">
> = {
  "Đồng Xuân": verifiedLocation({
    name: "UBND Xã Đồng Xuân",
    kind: "COMMUNE_PEOPLES_COMMITTEE",
    address: "94H3+7PR, La Hai, Đồng Xuân, Đắk Lắk, Việt Nam",
    plusCode: "94H3+7PR",
    lat: 13.3782428,
    lng: 109.104259,
    sourceUrl: "https://www.google.com/maps?q=13.3782428,109.104259",
  }),
  "Xuân Thọ": verifiedLocation({
    name: "UBND Xã Xuân Thọ",
    kind: "COMMUNE_PEOPLES_COMMITTEE",
    address: "C687+H84, Xuân Thọ, Đắk Lắk",
    plusCode: "C687+H84",
    lat: 13.4163942,
    lng: 109.2133158,
    sourceUrl: "https://www.google.com/maps?q=13.4163942,109.2133158",
  }),
  "Tuy An Bắc": verifiedLocation({
    name: "UBND Xã Tuy An Bắc",
    kind: "COMMUNE_PEOPLES_COMMITTEE",
    address: "8658+93M, Tuy An Bắc, Đắk Lắk",
    plusCode: "8658+93M",
    lat: 13.3084738,
    lng: 109.2151581,
    sourceUrl: "https://www.google.com/maps?q=13.3084738,109.2151581",
  }),
  "Tuy An Tây": verifiedLocation({
    name: "UBND Xã Tuy An Tây",
    kind: "COMMUNE_PEOPLES_COMMITTEE",
    address: "8526+V8G, Tuy An Tây, Đắk Lắk",
    plusCode: "8526+V8G",
    lat: 13.3021866,
    lng: 109.1608402,
    sourceUrl: "https://www.google.com/maps?q=13.3021866,109.1608402",
  }),
  "Xuân Lãnh": verifiedLocation({
    name: "UBND Xã Xuân Lãnh",
    kind: "COMMUNE_PEOPLES_COMMITTEE",
    address: "F2QJ+J73, Xuân Lãnh, Đắk Lắk",
    plusCode: "F2QJ+J73",
    lat: 13.4890203,
    lng: 109.0306681,
    sourceUrl: "https://www.google.com/maps?q=13.4890203,109.0306681",
  }),
  "Phú Mỡ": verifiedLocation({
    name: "UBND Xã Phú Mỡ",
    kind: "COMMUNE_PEOPLES_COMMITTEE",
    address: "9X4J+CWM, Phú Mỡ, Đắk Lắk",
    plusCode: "9X4J+CWM",
    lat: 13.3560758,
    lng: 108.9823087,
    sourceUrl: "https://www.google.com/maps?q=13.3560758,108.9823087",
  }),
  "Xuân Phước": verifiedLocation({
    name: "UBND Xã Xuân Phước",
    kind: "COMMUNE_PEOPLES_COMMITTEE",
    address: "73W7+VXW, Xuân Phước, Đắk Lắk",
    plusCode: "73W7+VXW",
    lat: 13.2972273,
    lng: 109.0649619,
    sourceUrl: "https://www.google.com/maps?q=13.2972273,109.0649619",
  }),
};

export const HOME_COMMUNE_WAREHOUSE_LOCATION =
  VERIFIED_COMMUNE_REFERENCE_POINTS["Đồng Xuân"];

export const VERIFIED_HAMLET_WAREHOUSE_LOCATIONS: Record<
  string,
  VerifiedWarehouseLocation<"HAMLET_CULTURAL_HOUSE">
> = {
  "ky-du": verifiedLocation({
    name: "Nhà Văn hóa thôn Kỳ Đu",
    kind: "HAMLET_CULTURAL_HOUSE",
    address: "9376+FWG, Thôn Kỳ Đu, Đồng Xuân, Đắk Lắk",
    plusCode: "9376+FWG",
    lat: 13.3636977,
    lng: 109.062318,
    sourceUrl: "https://www.google.com/maps?q=13.3636977,109.062318",
  }),
  "phuoc-hue": verifiedLocation({
    name: "Nhà Văn hoá thôn Phước Huệ",
    kind: "HAMLET_CULTURAL_HOUSE",
    address: "939H+XG2, Đồng Xuân, Đắk Lắk",
    plusCode: "939H+XG2",
    lat: 13.3698758,
    lng: 109.0787774,
    sourceUrl: "https://www.google.com/maps?q=13.3698758,109.0787774",
  }),
  "tan-binh": verifiedLocation({
    name: "Nhà sinh hoạt cộng đồng thôn Tân Bình",
    kind: "HAMLET_CULTURAL_HOUSE",
    address: "948V+5R8, Đồng Xuân, Đắk Lắk",
    plusCode: "948V+5R8",
    lat: 13.365686,
    lng: 109.144698,
    sourceUrl: "https://www.google.com/maps?q=13.365686,109.144698",
  }),
  "phu-son": verifiedLocation({
    name: "Nhà Văn hóa thôn Phú Sơn",
    kind: "HAMLET_CULTURAL_HOUSE",
    address: "922W+53F, Thôn Phú Sơn, Đồng Xuân, Đắk Lắk",
    plusCode: "922W+53F",
    lat: 13.3504381,
    lng: 109.0451656,
    sourceUrl: "https://www.google.com/maps?q=13.3504381,109.0451656",
  }),
  "triem-duc": verifiedLocation({
    name: "Nhà Văn hóa thôn Triêm Đức",
    kind: "HAMLET_CULTURAL_HOUSE",
    address: "936C+J4H, Đồng Xuân, Đắk Lắk",
    plusCode: "936C+J4H",
    lat: 13.3615575,
    lng: 109.0703455,
    sourceUrl: "https://www.google.com/maps?q=13.3615575,109.0703455",
  }),
};

export function getVerifiedCommuneReferencePoint(
  communeName: string,
): VerifiedWarehouseLocation<"COMMUNE_PEOPLES_COMMITTEE"> | null {
  return VERIFIED_COMMUNE_REFERENCE_POINTS[communeName] ?? null;
}

export function getVerifiedHamletWarehouseLocation(
  hamletKey: string,
): VerifiedWarehouseLocation<"HAMLET_CULTURAL_HOUSE"> | null {
  return VERIFIED_HAMLET_WAREHOUSE_LOCATIONS[hamletKey] ?? null;
}

export function validateVerifiedWarehouseLocations(): string[] {
  const errors: string[] = [];
  const coordinateOwners = new Map<string, string>();
  const locations = [
    ...Object.entries(VERIFIED_COMMUNE_REFERENCE_POINTS),
    ...Object.entries(VERIFIED_HAMLET_WAREHOUSE_LOCATIONS),
  ];

  for (const [key, location] of locations) {
    if (!Number.isFinite(location.lat) || location.lat < -90 || location.lat > 90) {
      errors.push(`${key} có vĩ độ không hợp lệ`);
    }
    if (!Number.isFinite(location.lng) || location.lng < -180 || location.lng > 180) {
      errors.push(`${key} có kinh độ không hợp lệ`);
    }
    if (!location.sourceUrl.startsWith("https://www.google.com/maps?q=")) {
      errors.push(`${key} thiếu nguồn Google Maps hợp lệ`);
    }

    const coordinateKey = `${location.lat.toFixed(7)},${location.lng.toFixed(7)}`;
    const existingOwner = coordinateOwners.get(coordinateKey);
    if (existingOwner) {
      errors.push(`${key} trùng tọa độ với ${existingOwner}`);
    } else {
      coordinateOwners.set(coordinateKey, key);
    }
  }

  return errors;
}
