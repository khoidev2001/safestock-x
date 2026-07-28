// Bổ sung ngữ cảnh xã/phường cho địa danh từ dữ liệu ranh giới cục bộ.
// Chạy: node scripts/enrich-daklak-places.mjs
import fs from "node:fs/promises";

const COMMUNES = "public/geo/daklak-communes.geojson";
const PLACES = "public/geo/daklak-places.geojson";

// Một số ranh giới OSM chồng lấn tại cụm Cư Bang. Các bản ghi này có ngữ cảnh
// địa danh hoặc cụm dữ liệu lân cận xác định chúng thuộc Xã Cư Pơng.
const AMBIGUOUS_COMMUNE_OVERRIDES = new Map([
  ["n12479667961", 18496865],
  ["n6420214999", 18496865],
  ["n7983611885", 18496865],
]);

const communesGeo = JSON.parse(await fs.readFile(COMMUNES, "utf8"));
const communesByOsmId = new Map(
  (communesGeo.features ?? []).map((feature) => [
    feature.properties?.osmId,
    feature,
  ]),
);
const placesGeo = JSON.parse(await fs.readFile(PLACES, "utf8"));
const communes = (communesGeo.features ?? []).map((feature) => ({
  feature,
  bounds: geometryBounds(feature.geometry),
}));

let assigned = 0;
let resolvedAmbiguous = 0;
let unresolvedAmbiguous = 0;
let outside = 0;
let unsupported = 0;
const enrichedFeatures = [];

for (const feature of placesGeo.features ?? []) {
  if (feature.geometry?.type !== "Point") {
    unsupported++;
    continue;
  }

  const point = feature.geometry.coordinates;
  const matches = communes.filter(
    ({ feature: commune, bounds }) =>
      pointInBounds(point, bounds) && pointInGeometry(point, commune.geometry),
  );

  let parent = matches.length === 1 ? matches[0].feature : null;
  if (matches.length > 1) {
    const overrideOsmId = AMBIGUOUS_COMMUNE_OVERRIDES.get(
      feature.properties?.osmId,
    );
    const override = communesByOsmId.get(overrideOsmId);
    if (
      override &&
      matches.some(
        ({ feature: commune }) =>
          commune.properties?.osmId === overrideOsmId,
      )
    ) {
      parent = override;
      resolvedAmbiguous++;
    } else {
      unresolvedAmbiguous++;
      continue;
    }
  }
  if (!parent) {
    outside++;
    continue;
  }

  const communeName =
    parent.properties?.fullName ?? parent.properties?.name;
  feature.properties.communeName = communeName;
  feature.properties.communeOsmId = parent.properties?.osmId;
  feature.properties.displayName = formatDisplayName(
    feature.properties,
    communeName,
  );
  enrichedFeatures.push(feature);
  assigned++;
}

placesGeo.features = enrichedFeatures;
await fs.writeFile(PLACES, `${JSON.stringify(placesGeo)}\n`, "utf8");
console.log(
  `Đã bổ sung ngữ cảnh địa danh: giữ ${assigned} địa danh ` +
    `(giải quyết ${resolvedAmbiguous} điểm trong ranh giới chồng lấn); ` +
    `loại ${unresolvedAmbiguous} điểm chồng lấn chưa xác định, ${outside} điểm ngoài ranh giới ` +
    `và ${unsupported} geometry không được hỗ trợ.`,
);

function formatDisplayName(properties, communeName) {
  const prefix = settlementPrefix(properties.group, properties.kind);
  const name =
    prefix && !hasKnownPrefix(properties.name)
      ? `${prefix} ${properties.name}`
      : properties.name;
  return communeName ? `${name} · ${communeName}` : name;
}

function settlementPrefix(group, kind) {
  if (group !== "place") return null;
  if (["hamlet", "village", "neighbourhood", "quarter"].includes(kind)) {
    return "Thôn";
  }
  if (kind === "town" || kind === "suburb") return "Khu vực";
  if (kind === "isolated_dwelling") return "Xóm";
  return null;
}

function hasKnownPrefix(name) {
  return /^(Thôn|Buôn|Bon|Buôn làng|Xóm|Tổ dân phố|Khu phố|Khu vực|Địa điểm)\s/iu.test(
    name,
  );
}

function geometryBounds(geometry) {
  const bounds = {
    minLng: Infinity,
    minLat: Infinity,
    maxLng: -Infinity,
    maxLat: -Infinity,
  };
  walkCoordinates(geometry.coordinates, ([lng, lat]) => {
    bounds.minLng = Math.min(bounds.minLng, lng);
    bounds.minLat = Math.min(bounds.minLat, lat);
    bounds.maxLng = Math.max(bounds.maxLng, lng);
    bounds.maxLat = Math.max(bounds.maxLat, lat);
  });
  return bounds;
}

function walkCoordinates(coordinates, visit) {
  if (Array.isArray(coordinates) && typeof coordinates[0] === "number") {
    visit(coordinates);
    return;
  }
  for (const value of coordinates ?? []) walkCoordinates(value, visit);
}

function pointInBounds([lng, lat], bounds) {
  return (
    lng >= bounds.minLng &&
    lng <= bounds.maxLng &&
    lat >= bounds.minLat &&
    lat <= bounds.maxLat
  );
}

function pointInGeometry(point, geometry) {
  if (geometry.type === "Polygon") {
    return pointInPolygon(point, geometry.coordinates);
  }
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.some((polygon) => pointInPolygon(point, polygon));
  }
  return false;
}

function pointInPolygon(point, rings) {
  if (!rings.length || !pointInRing(point, rings[0])) return false;
  return !rings.slice(1).some((ring) => pointInRing(point, ring));
}

function pointInRing([x, y], ring) {
  let inside = false;
  for (
    let index = 0, previous = ring.length - 1;
    index < ring.length;
    previous = index++
  ) {
    const [xi, yi] = ring[index];
    const [xj, yj] = ring[previous];
    const intersects =
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}
