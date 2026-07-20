// Tải ranh giới hành chính 5 xã/phường từ các relation OSM đã xác minh.
// Chạy: node scripts/download-osm-communes.mjs
import fs from "node:fs/promises";
import path from "node:path";

const OUTPUT = "public/geo/communes.geojson";
const USER_AGENT = "UngPhoNhanh-GIS/1.0 (offline boundary builder)";
const COMMUNES = [
  { relationId: 19392118, name: "Đồng Xuân", fullName: "Xã Đồng Xuân", code: "22081", areaKm2: 206.26 },
  { relationId: 19392094, name: "Xuân Lãnh", fullName: "Xã Xuân Lãnh", code: "22090", areaKm2: 174.65 },
  { relationId: 19392092, name: "Xuân Phước", fullName: "Xã Xuân Phước", code: "22111", areaKm2: 102.81 },
  { relationId: 19392091, name: "Xuân Thọ", fullName: "Xã Xuân Thọ", code: "22075", areaKm2: 192.12 },
  { relationId: 19392095, name: "Xuân Đài", fullName: "Phường Xuân Đài", code: "22076", areaKm2: 13.4 },
];

const features = [];
for (const commune of COMMUNES) {
  const url = new URL("https://nominatim.openstreetmap.org/details");
  url.search = new URLSearchParams({
    osmtype: "R",
    osmid: String(commune.relationId),
    format: "json",
    polygon_geojson: "1",
  });

  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`${commune.fullName}: HTTP ${response.status}`);

  const result = await response.json();
  const geometry = result.geometry;
  if (!geometry || !["Polygon", "MultiPolygon"].includes(geometry.type)) {
    throw new Error(`${commune.fullName}: OSM không trả polygon hợp lệ`);
  }
  if (result.extratags?.admin_level !== "6") {
    throw new Error(`${commune.fullName}: admin_level không phải 6`);
  }
  if (result.localname !== commune.fullName) {
    throw new Error(`${commune.fullName}: tên OSM hiện là ${result.localname ?? "không xác định"}`);
  }

  features.push({
    type: "Feature",
    properties: {
      name: commune.name,
      fullName: commune.fullName,
      code: commune.code,
      areaKm2: commune.areaKm2,
      source: "OpenStreetMap",
      osmType: "relation",
      osmId: commune.relationId,
      adminLevel: 6,
    },
    geometry,
  });
}

const collection = {
  type: "FeatureCollection",
  name: "Ranh giới 5 xã cụm Đồng Xuân (OSM)",
  source: "OpenStreetMap contributors",
  license: "ODbL 1.0",
  features,
};

await fs.mkdir(path.dirname(OUTPUT), { recursive: true });
await fs.writeFile(OUTPUT, `${JSON.stringify(collection)}\n`, "utf8");
console.log(`Đã ghi ${features.length} ranh giới OSM vào ${OUTPUT}.`);
