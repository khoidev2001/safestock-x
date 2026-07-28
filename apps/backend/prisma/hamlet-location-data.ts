import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export const DONG_XUAN_BOUNDARY_REF = "r19392118";
export const HAMLET_LOCATION_DATA_PATH = resolve(
  __dirname,
  "data/hamlet-cultural-house-locations.json",
);

export const HAMLET_LOCATION_IDENTITIES = [
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
] as const;

export type CulturalHouseLocationMethod =
  "CULTURAL_HOUSE_GOOGLE_MAPS" | "CULTURAL_HOUSE_OSM" | "CULTURAL_HOUSE_OFFICIAL";

export interface HamletCulturalHouseLocation {
  key: string;
  hamletName: string;
  aliases: string[];
  lat: number | null;
  lng: number | null;
  method: CulturalHouseLocationMethod;
  sourceName: string;
  sourceUrl: string;
  sourceRef: string;
  checkedAt: string;
  methodNote: string;
  reviewStatus: "APPROVED" | "UNRESOLVED";
}

export interface HamletCulturalHouseLocationDataset {
  version: string;
  boundaryRef: string;
  locations: HamletCulturalHouseLocation[];
}

export function loadHamletCulturalHouseLocations(
  path = HAMLET_LOCATION_DATA_PATH,
): HamletCulturalHouseLocationDataset {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`Không thể đọc bộ vị trí nhà văn hóa thôn tại ${path}: ${errorMessage(error)}`);
  }

  const errors = validateHamletCulturalHouseLocations(parsed);
  if (errors.length > 0) {
    throw new Error(`Bộ vị trí nhà văn hóa thôn không hợp lệ:\n- ${errors.join("\n- ")}`);
  }
  return parsed as HamletCulturalHouseLocationDataset;
}

export function validateHamletCulturalHouseLocations(dataset: unknown): string[] {
  if (!isRecord(dataset)) return ["Dữ liệu nhà văn hóa phải là một object"];

  const errors: string[] = [];
  if (typeof dataset.version !== "string" || dataset.version.trim() === "") {
    errors.push("Thiếu version của bộ dữ liệu");
  }
  if (dataset.boundaryRef !== DONG_XUAN_BOUNDARY_REF) {
    errors.push(`boundaryRef phải là ${DONG_XUAN_BOUNDARY_REF}`);
  }
  if (!Array.isArray(dataset.locations)) {
    errors.push("locations phải là một mảng");
    return errors;
  }

  const expectedByKey = new Map<string, string>(HAMLET_LOCATION_IDENTITIES);
  const seenKeys = new Set<string>();
  const seenCoordinates = new Set<string>();
  let approvedCount = 0;

  for (const [index, raw] of dataset.locations.entries()) {
    const prefix = `locations[${index}]`;
    if (!isRecord(raw)) {
      errors.push(`${prefix} phải là một object`);
      continue;
    }

    const key = stringValue(raw.key);
    const hamletName = stringValue(raw.hamletName);
    const expectedName = expectedByKey.get(key);
    if (!expectedName)
      errors.push(`${prefix}.key không thuộc danh sách 17 thôn: ${key || "(trống)"}`);
    if (expectedName && hamletName !== expectedName) {
      errors.push(`${prefix}.hamletName phải là ${expectedName}`);
    }
    if (seenKeys.has(key)) errors.push(`Khóa vị trí nhà văn hóa bị trùng: ${key}`);
    if (key) seenKeys.add(key);

    if (!Array.isArray(raw.aliases) || raw.aliases.some((alias) => typeof alias !== "string")) {
      errors.push(`${prefix}.aliases phải là mảng chuỗi`);
    }

    const lat = raw.lat;
    const lng = raw.lng;
    const unresolved = raw.reviewStatus === "UNRESOLVED";
    if (unresolved) {
      if ((lat === null) !== (lng === null)) {
        errors.push(`${prefix} chưa xác minh không được thiếu một phần tọa độ ứng viên`);
      }
      if (
        lat !== null &&
        (typeof lat !== "number" || !Number.isFinite(lat) || lat < -90 || lat > 90)
      ) {
        errors.push(`${prefix}.lat ứng viên không hợp lệ`);
      }
      if (
        lng !== null &&
        (typeof lng !== "number" || !Number.isFinite(lng) || lng < -180 || lng > 180)
      ) {
        errors.push(`${prefix}.lng ứng viên không hợp lệ`);
      }
    } else {
      if (typeof lat !== "number" || !Number.isFinite(lat) || lat < -90 || lat > 90) {
        errors.push(`${prefix}.lat không hợp lệ`);
      }
      if (typeof lng !== "number" || !Number.isFinite(lng) || lng < -180 || lng > 180) {
        errors.push(`${prefix}.lng không hợp lệ`);
      }
    }
    if (typeof lat === "number" && typeof lng === "number") {
      const coordinateKey = `${lat.toFixed(7)},${lng.toFixed(7)}`;
      if (seenCoordinates.has(coordinateKey)) {
        errors.push(`Hai thôn dùng cùng một vị trí nhà văn hóa: ${coordinateKey}`);
      }
      seenCoordinates.add(coordinateKey);
    }

    if (
      raw.method !== "CULTURAL_HOUSE_GOOGLE_MAPS" &&
      raw.method !== "CULTURAL_HOUSE_OSM" &&
      raw.method !== "CULTURAL_HOUSE_OFFICIAL"
    ) {
      errors.push(`${prefix}.method không phải phương pháp nhà văn hóa được hỗ trợ`);
    }
    for (const field of ["sourceName", "sourceUrl", "sourceRef", "methodNote"] as const) {
      if (!stringValue(raw[field])) errors.push(`${prefix}.${field} không được để trống`);
    }
    const sourceUrl = stringValue(raw.sourceUrl);
    if (sourceUrl && !isHttpUrl(sourceUrl))
      errors.push(`${prefix}.sourceUrl không phải URL HTTP(S)`);
    if (raw.method === "CULTURAL_HOUSE_OSM" && !/^[nwr]\d+$/.test(stringValue(raw.sourceRef))) {
      errors.push(`${prefix}.sourceRef phải là OSM object id dạng n/w/r + số`);
    }
    if (!isIsoDate(stringValue(raw.checkedAt)))
      errors.push(`${prefix}.checkedAt không phải ISO date`);
    if (raw.reviewStatus !== "APPROVED" && raw.reviewStatus !== "UNRESOLVED") {
      errors.push(`${prefix}.reviewStatus phải là APPROVED hoặc UNRESOLVED`);
    }
    if (raw.reviewStatus === "APPROVED") approvedCount++;
  }

  if (dataset.locations.length !== HAMLET_LOCATION_IDENTITIES.length) {
    errors.push(
      `Phải có đúng ${HAMLET_LOCATION_IDENTITIES.length} điểm, hiện có ${dataset.locations.length}`,
    );
  }
  for (const [key] of HAMLET_LOCATION_IDENTITIES) {
    if (!seenKeys.has(key)) errors.push(`Thiếu bản ghi nhà văn hóa: ${key}`);
  }
  if (approvedCount > 0 && approvedCount < HAMLET_LOCATION_IDENTITIES.length) {
    errors.push("Chỉ được duyệt khi đã xác minh đủ nhà văn hóa cho cả 17 thôn");
  }

  return errors;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function isIsoDate(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z)?$/.test(value) &&
    !Number.isNaN(Date.parse(value))
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
