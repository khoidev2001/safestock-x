// Kiểm tra dữ liệu ranh giới OSM và bộ tile offline trước khi build/demo.
// Chạy: node scripts/verify-gis.mjs
import fs from "node:fs";
import path from "node:path";

const GEOJSON_PATH = "public/geo/communes.geojson";
const TILE_ROOT = "public/tiles";
const EXPECTED = new Map([
  ["Đồng Xuân", 19392118],
  ["Xuân Lãnh", 19392094],
  ["Xuân Phước", 19392092],
  ["Xuân Thọ", 19392091],
  ["Xuân Đài", 19392095],
]);
const BBOX_LIMIT = [108.9, 13.2, 109.3, 13.7];
const TILE_BBOX = [108.9483, 13.2393, 109.2551, 13.6202];
const ZOOM_MIN = 10;
const ZOOM_MAX = 15;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function walkCoordinates(coordinates, visit) {
  if (Array.isArray(coordinates) && typeof coordinates[0] === "number") {
    visit(coordinates);
    return;
  }
  assert(Array.isArray(coordinates), "Cấu trúc coordinates không hợp lệ");
  coordinates.forEach((value) => walkCoordinates(value, visit));
}

const geojson = JSON.parse(fs.readFileSync(GEOJSON_PATH, "utf8"));
assert(geojson.type === "FeatureCollection", "GeoJSON phải là FeatureCollection");
assert(geojson.features.length === EXPECTED.size, `GeoJSON phải có đúng ${EXPECTED.size} feature`);
assert(geojson.license === "ODbL 1.0", "GeoJSON phải khai báo license ODbL 1.0");

const seen = new Set();
for (const feature of geojson.features) {
  const { name, source, osmType, osmId, adminLevel } = feature.properties ?? {};
  assert(EXPECTED.get(name) === osmId, `${name ?? "Feature"}: sai hoặc thiếu relation OSM`);
  assert(!seen.has(name), `${name}: bị trùng feature`);
  assert(source === "OpenStreetMap" && osmType === "relation", `${name}: sai nguồn OSM`);
  assert(adminLevel === 6, `${name}: adminLevel phải là 6`);
  assert(
    ["Polygon", "MultiPolygon"].includes(feature.geometry?.type),
    `${name}: geometry không phải polygon`,
  );

  let points = 0;
  walkCoordinates(feature.geometry.coordinates, ([lng, lat]) => {
    assert(Number.isFinite(lng) && Number.isFinite(lat), `${name}: toạ độ không hữu hạn`);
    assert(lng >= BBOX_LIMIT[0] && lng <= BBOX_LIMIT[2], `${name}: kinh độ ngoài vùng dự kiến`);
    assert(lat >= BBOX_LIMIT[1] && lat <= BBOX_LIMIT[3], `${name}: vĩ độ ngoài vùng dự kiến`);
    points++;
  });
  assert(points >= 100, `${name}: geometry quá ít điểm (${points})`);
  seen.add(name);
}

const lon2x = (lon, zoom) => Math.floor(((lon + 180) / 360) * 2 ** zoom);
const lat2y = (lat, zoom) => {
  const radians = (lat * Math.PI) / 180;
  return Math.floor(
    ((1 - Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) / 2) * 2 ** zoom,
  );
};

const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
let tileCount = 0;
for (let zoom = ZOOM_MIN; zoom <= ZOOM_MAX; zoom++) {
  const xMin = lon2x(TILE_BBOX[0], zoom);
  const xMax = lon2x(TILE_BBOX[2], zoom);
  const yMin = lat2y(TILE_BBOX[3], zoom);
  const yMax = lat2y(TILE_BBOX[1], zoom);

  for (let x = xMin; x <= xMax; x++) {
    for (let y = yMin; y <= yMax; y++) {
      const relativePath = `${zoom}/${x}/${y}.png`;
      const tilePath = path.join(TILE_ROOT, String(zoom), String(x), `${y}.png`);
      assert(fs.existsSync(tilePath), `${relativePath}: thiếu tile offline`);
      const buffer = fs.readFileSync(tilePath);
      assert(
        buffer.length >= 24 && buffer.subarray(0, 8).equals(pngSignature),
        `${relativePath}: không phải PNG`,
      );
      assert(
        buffer.readUInt32BE(16) === 256 && buffer.readUInt32BE(20) === 256,
        `${relativePath}: tile không phải 256x256`,
      );
      tileCount++;
    }
  }
}

console.log(
  `GIS hợp lệ: ${seen.size} relation OSM, đủ ${tileCount} tile PNG 256x256 theo BBOX (zoom ${ZOOM_MIN}-${ZOOM_MAX}).`,
);
