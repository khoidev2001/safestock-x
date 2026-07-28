// Kiểm tra dữ liệu ranh giới OSM và bộ tile offline trước khi build/demo.
// Chạy: node scripts/verify-gis.mjs
import fs from "node:fs";
import path from "node:path";

const GEOJSON_PATH = "public/geo/communes.geojson";
const DAKLAK_COMMUNES_PATH = "public/geo/daklak-communes.geojson";
const DAKLAK_OFFICIAL_UNITS_PATH = "data/daklak-official-units.json";
const PLACES_PATH = "public/geo/daklak-places.geojson";
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
const EXPECTED_PLACE_COUNT = 3536;
const REQUIRED_AMBIGUOUS_PLACES = new Map([
  ["n12479667961", "Thôn Cư Bang · Xã Cư Pơng"],
  ["n6420214999", "QT Ngọc Dung ( Nguyễn Thị Dung ) · Xã Cư Pơng"],
  ["n7983611885", "QT Ngọc Thanh ( Trần Thị Ngọc Thanh ) thôn Cư Bang xã Cư Pơng · Xã Cư Pơng"],
]);

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

const daklakCommunes = JSON.parse(fs.readFileSync(DAKLAK_COMMUNES_PATH, "utf8"));
const officialUnits = JSON.parse(fs.readFileSync(DAKLAK_OFFICIAL_UNITS_PATH, "utf8"));
assert(
  daklakCommunes.type === "FeatureCollection" && daklakCommunes.features.length === 102,
  "daklak-communes.geojson phải có đủ 102 xã/phường",
);
assert(
  officialUnits.provinceCode === "66" && officialUnits.units?.length === 102,
  "Danh mục chuẩn Đắk Lắk phải có đúng 102 xã/phường",
);
const officialByName = new Map(
  officialUnits.units.map((unit) => [unit.name.normalize("NFC"), unit]),
);
const localNames = new Set();
for (const feature of daklakCommunes.features) {
  const properties = feature.properties ?? {};
  const fullName = properties.fullName?.normalize("NFC");
  const official = officialByName.get(fullName);
  assert(official, `${properties.fullName ?? "Feature"}: tên không khớp danh mục chuẩn hiện hành`);
  assert(!localNames.has(fullName), `${fullName}: bị trùng đơn vị hành chính`);
  assert(properties.officialCode === official.code, `${fullName}: sai hoặc thiếu mã hành chính`);
  assert(
    properties.officialMapId === official.mapId,
    `${fullName}: sai hoặc thiếu ID bản đồ chuẩn`,
  );
  assert(
    ["Polygon", "MultiPolygon"].includes(feature.geometry?.type),
    `${fullName}: geometry không phải polygon`,
  );
  let coordinateCount = 0;
  walkCoordinates(feature.geometry.coordinates, ([lng, lat]) => {
    assert(Number.isFinite(lng) && Number.isFinite(lat), `${fullName}: tọa độ không hữu hạn`);
    assert(lng >= 107.4 && lng <= 110.0, `${fullName}: kinh độ ngoài phạm vi Đắk Lắk`);
    assert(lat >= 11.7 && lat <= 13.7, `${fullName}: vĩ độ ngoài phạm vi Đắk Lắk`);
    coordinateCount++;
  });
  assert(coordinateCount >= 20, `${fullName}: geometry quá ít điểm (${coordinateCount})`);
  localNames.add(fullName);
}
assert(
  localNames.size === officialByName.size,
  "Ranh giới cục bộ bị thiếu hoặc thừa đơn vị so với danh mục chuẩn",
);

const places = JSON.parse(fs.readFileSync(PLACES_PATH, "utf8"));
assert(
  places.type === "FeatureCollection" && places.features.length === EXPECTED_PLACE_COUNT,
  `daklak-places.geojson phải có đúng ${EXPECTED_PLACE_COUNT} địa danh`,
);
const placeProperties = places.features.map((feature) => feature.properties ?? {});
const communeNameByOsmId = new Map(
  daklakCommunes.features.map((feature) => [
    feature.properties?.osmId,
    feature.properties?.fullName,
  ]),
);
const placesByOsmId = new Map(placeProperties.map((properties) => [properties.osmId, properties]));
for (const [osmId, displayName] of REQUIRED_AMBIGUOUS_PLACES) {
  assert(
    placesByOsmId.get(osmId)?.displayName === displayName,
    `Thiếu hoặc sai ngữ cảnh địa danh chồng lấn ${osmId}`,
  );
}

assert(
  placeProperties.every((properties) => typeof properties.osmId === "string"),
  "Mỗi địa danh phải giữ osmId nguồn để kiểm tra giữ lại dữ liệu",
);

assert(
  placeProperties.every(
    (properties) =>
      typeof properties.displayName === "string" &&
      typeof properties.communeName === "string" &&
      Number.isFinite(properties.communeOsmId) &&
      properties.displayName.endsWith(` · ${properties.communeName}`),
  ),
  "Mỗi địa danh phải có displayName và ngữ cảnh xã/phường hợp lệ",
);
assert(
  placeProperties.every(
    (properties) => communeNameByOsmId.get(properties.communeOsmId) === properties.communeName,
  ),
  "Ngữ cảnh địa danh phải dùng tên xã/phường chính thức hiện hành",
);
assert(
  placeProperties.some(
    (properties) =>
      properties.name === "Phước Lộc" && properties.displayName === "Thôn Phước Lộc · Xã Tam Giang",
  ),
  "Thiếu ngữ cảnh Xã Tam Giang cho Phước Lộc",
);
assert(
  placeProperties.some(
    (properties) =>
      properties.name === "Phước Lộc" && properties.displayName === "Thôn Phước Lộc · Xã Đức Bình",
  ),
  "Thiếu ngữ cảnh Xã Đức Bình cho Phước Lộc",
);
assert(
  placeProperties.some(
    (properties) =>
      properties.name === "Phước Lộc" &&
      properties.displayName === "Thôn Phước Lộc · Xã Xuân Phước",
  ),
  "Thiếu ngữ cảnh Xã Xuân Phước cho Phước Lộc",
);
assert(
  placeProperties.some(
    (properties) =>
      properties.group === "health" &&
      properties.name === "Trung tâm Y tế Đồng Xuân" &&
      properties.displayName === "Trung tâm Y tế Đồng Xuân · Xã Đồng Xuân",
  ),
  "Thiếu ngữ cảnh Xã Đồng Xuân cho POI y tế",
);

console.log(
  `GIS hợp lệ: ${seen.size} relation OSM, đủ ${tileCount} tile PNG 256x256 theo BBOX ` +
    `(zoom ${ZOOM_MIN}-${ZOOM_MAX}), ${places.features.length} địa danh có displayName.`,
);
