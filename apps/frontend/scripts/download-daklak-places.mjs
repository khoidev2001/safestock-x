// Tải địa danh/POI có tên (chợ, trường, trạm y tế, UBND, cây xăng, quán, thôn…)
// trong 102 xã/phường Đắk Lắk từ OpenStreetMap (Overpass), để tự vẽ ghim + tên
// tô màu trên bản đồ — thay cho tile nhãn có chữ "huyện" (đã bỏ đơn vị huyện).
//
// Chiến lược: lặp theo bbox từng xã trong daklak-communes.geojson (truy vấn nhỏ,
// ít timeout hơn nhiều so với 1 truy vấn toàn tỉnh), thử nhiều mirror, backoff,
// gộp trùng theo osm id, và LỌC BỎ mọi POI có chữ "huyện".
//
// Chạy: node scripts/download-daklak-places.mjs
import fs from "node:fs/promises";
import path from "node:path";

const COMMUNES = "public/geo/daklak-communes.geojson";
const OUTPUT = "public/geo/daklak-places.geojson";
const MIRRORS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];
const RATE_LIMIT_MS = 1000; // nghỉ giữa các xã cho lịch sự với server công cộng
const MAX_RETRY = 4;

// Nhóm POI cần lấy → màu ghim (đồng bộ với chú giải trên web).
// Chỉ lấy loại có ích cho điều phối cứu hộ & định vị.
const CATEGORIES = [
  // amenity quan trọng
  { tag: "amenity", values: ["hospital", "clinic", "doctors", "pharmacy"], group: "health" },
  { tag: "amenity", values: ["school", "college", "university", "kindergarten"], group: "school" },
  {
    tag: "amenity",
    values: ["townhall", "community_centre", "police", "fire_station", "post_office"],
    group: "civic",
  },
  { tag: "amenity", values: ["marketplace", "fuel", "bank"], group: "commerce" },
  { tag: "amenity", values: ["place_of_worship"], group: "worship" },
  // place: thôn/xóm/làng — rất cần cho định vị
  {
    tag: "place",
    values: [
      "hamlet",
      "village",
      "neighbourhood",
      "town",
      "suburb",
      "quarter",
      "isolated_dwelling",
    ],
    group: "place",
  },
  { tag: "shop", values: ["*"], group: "commerce" },
  { tag: "tourism", values: ["*"], group: "poi" },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (s) => (s ?? "").normalize("NFC").trim().toLowerCase();

// bbox [minLat,minLng,maxLat,maxLng] của 1 geometry Polygon/MultiPolygon.
function bboxOf(geometry) {
  let minLat = 90,
    minLng = 180,
    maxLat = -90,
    maxLng = -180;
  const scan = (coords) => {
    if (typeof coords[0] === "number") {
      const [lng, lat] = coords;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      return;
    }
    for (const c of coords) scan(c);
  };
  scan(geometry.coordinates);
  return [minLat, minLng, maxLat, maxLng];
}

function buildQuery(bbox) {
  const b = bbox.map((n) => n.toFixed(5)).join(",");
  const clauses = [];
  for (const cat of CATEGORIES) {
    if (cat.values.length === 1 && cat.values[0] === "*") {
      clauses.push(`node["${cat.tag}"]["name"](${b});`);
      clauses.push(`way["${cat.tag}"]["name"](${b});`);
    } else {
      const re = cat.values.join("|");
      clauses.push(`node["${cat.tag}"~"^(${re})$"]["name"](${b});`);
      clauses.push(`way["${cat.tag}"~"^(${re})$"]["name"](${b});`);
    }
  }
  return `[out:json][timeout:50];(${clauses.join("")});out center tags;`;
}

async function overpass(query) {
  let lastErr = "";
  for (let attempt = 0; attempt < MAX_RETRY; attempt++) {
    const mirror = MIRRORS[attempt % MIRRORS.length];
    try {
      const res = await fetch(mirror, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ data: query }).toString(),
      });
      if (res.ok) return await res.json();
      lastErr = `HTTP ${res.status}`;
    } catch (e) {
      lastErr = String(e.message ?? e);
    }
    await sleep(1500 * (attempt + 1)); // backoff tuyến tính
  }
  throw new Error(lastErr || "overpass thất bại");
}

// Gán nhóm màu cho 1 element theo tag đã biết.
function groupOf(tags) {
  for (const cat of CATEGORIES) {
    const v = tags[cat.tag];
    if (!v) continue;
    if (cat.values.includes("*") || cat.values.includes(v)) return cat.group;
  }
  return "poi";
}

const communesGeo = JSON.parse(await fs.readFile(COMMUNES, "utf8"));
const features = communesGeo.features ?? [];
console.log(`Nạp ${features.length} xã từ ${COMMUNES}.`);

const byId = new Map(); // dedupe theo "n123"/"w456"
let dropped = 0;

for (let i = 0; i < features.length; i++) {
  const f = features[i];
  const name = f.properties?.name ?? f.properties?.fullName ?? `#${i}`;
  let data;
  try {
    data = await overpass(buildQuery(bboxOf(f.geometry)));
  } catch (e) {
    console.warn(`✗ [${i + 1}/${features.length}] ${name}: ${e.message}`);
    await sleep(RATE_LIMIT_MS);
    continue;
  }
  let added = 0;
  for (const el of data.elements ?? []) {
    const tags = el.tags ?? {};
    const nm = tags.name;
    if (!nm) continue;
    // BỎ mọi địa danh còn chữ "huyện" (đơn vị huyện đã giải thể 2025).
    if (norm(nm).includes("huyện")) {
      dropped++;
      continue;
    }
    const key = `${el.type[0]}${el.id}`;
    if (byId.has(key)) continue;
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (lat == null || lng == null) continue;
    byId.set(key, {
      type: "Feature",
      properties: {
        name: nm,
        group: groupOf(tags),
        kind: tags.amenity || tags.shop || tags.tourism || tags.place || "poi",
        osmId: key,
      },
      geometry: { type: "Point", coordinates: [Number(lng.toFixed(6)), Number(lat.toFixed(6))] },
    });
    added++;
  }
  console.log(`✓ [${i + 1}/${features.length}] ${name}: +${added} (tổng ${byId.size})`);
  await sleep(RATE_LIMIT_MS);
}

const collection = {
  type: "FeatureCollection",
  name: "Địa danh/POI 102 xã Đắk Lắk (OSM, đã bỏ 'huyện')",
  source: "OpenStreetMap contributors",
  license: "ODbL 1.0",
  generatedAt: new Date().toISOString(),
  features: [...byId.values()],
};

await fs.mkdir(path.dirname(OUTPUT), { recursive: true });
await fs.writeFile(OUTPUT, `${JSON.stringify(collection)}\n`, "utf8");
console.log(
  `\nĐã ghi ${collection.features.length} địa danh vào ${OUTPUT} (bỏ ${dropped} mục có chữ 'huyện').`,
);
