// Bổ sung địa danh cho các xã bị lỗi (HTTP 406) trong lần tải trước, rồi gộp vào
// daklak-places.geojson (không tải lại toàn bộ). Truyền tên xã qua đối số dòng lệnh.
// Chạy: node scripts/patch-daklak-places.mjs "Hòa Phú" "Ea Knốp" "Hòa Sơn"
import fs from "node:fs/promises";

const COMMUNES = "public/geo/daklak-communes.geojson";
const OUTPUT = "public/geo/daklak-places.geojson";
const MIRRORS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];
const MAX_RETRY = 6;

const CATEGORIES = [
  { tag: "amenity", values: ["hospital", "clinic", "doctors", "pharmacy"], group: "health" },
  { tag: "amenity", values: ["school", "college", "university", "kindergarten"], group: "school" },
  {
    tag: "amenity",
    values: ["townhall", "community_centre", "police", "fire_station", "post_office"],
    group: "civic",
  },
  { tag: "amenity", values: ["marketplace", "fuel", "bank"], group: "commerce" },
  { tag: "amenity", values: ["place_of_worship"], group: "worship" },
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

function bboxOf(geometry) {
  let minLat = 90,
    minLng = 180,
    maxLat = -90,
    maxLng = -180;
  const scan = (c) => {
    if (typeof c[0] === "number") {
      const [lng, lat] = c;
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
      minLng = Math.min(minLng, lng);
      maxLng = Math.max(maxLng, lng);
      return;
    }
    for (const x of c) scan(x);
  };
  scan(geometry.coordinates);
  return [minLat, minLng, maxLat, maxLng];
}

function buildQuery(bbox) {
  const b = bbox.map((n) => n.toFixed(5)).join(",");
  const clauses = [];
  for (const cat of CATEGORIES) {
    if (cat.values.length === 1 && cat.values[0] === "*") {
      clauses.push(`node["${cat.tag}"]["name"](${b});`, `way["${cat.tag}"]["name"](${b});`);
    } else {
      const re = cat.values.join("|");
      clauses.push(
        `node["${cat.tag}"~"^(${re})$"]["name"](${b});`,
        `way["${cat.tag}"~"^(${re})$"]["name"](${b});`,
      );
    }
  }
  return `[out:json][timeout:60];(${clauses.join("")});out center tags;`;
}

async function overpass(query) {
  let lastErr = "";
  for (let a = 0; a < MAX_RETRY; a++) {
    const mirror = MIRRORS[a % MIRRORS.length];
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
    await sleep(2500 * (a + 1));
  }
  throw new Error(lastErr);
}

function groupOf(tags) {
  for (const cat of CATEGORIES) {
    const v = tags[cat.tag];
    if (!v) continue;
    if (cat.values.includes("*") || cat.values.includes(v)) return cat.group;
  }
  return "poi";
}

const targets = process.argv.slice(2);
if (!targets.length) {
  console.error('Cần truyền tên xã, ví dụ: node scripts/patch-daklak-places.mjs "Hòa Phú"');
  process.exit(1);
}

const communesGeo = JSON.parse(await fs.readFile(COMMUNES, "utf8"));
const existing = JSON.parse(await fs.readFile(OUTPUT, "utf8"));
const byId = new Map(existing.features.map((f) => [f.properties.osmId, f]));
const before = byId.size;
let dropped = 0;

for (const target of targets) {
  const f = communesGeo.features.find((x) => norm(x.properties?.name) === norm(target));
  if (!f) {
    console.warn(`✗ không thấy xã "${target}" trong ${COMMUNES}`);
    continue;
  }
  let data;
  try {
    data = await overpass(buildQuery(bboxOf(f.geometry)));
  } catch (e) {
    console.warn(`✗ ${target}: ${e.message}`);
    continue;
  }
  let added = 0;
  for (const el of data.elements ?? []) {
    const tags = el.tags ?? {};
    const nm = tags.name;
    if (!nm || norm(nm).includes("huyện")) {
      if (nm) dropped++;
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
  console.log(`✓ ${target}: +${added} (tổng ${byId.size})`);
}

existing.features = [...byId.values()];
existing.generatedAt = new Date().toISOString();
await fs.writeFile(OUTPUT, `${JSON.stringify(existing)}\n`, "utf8");
console.log(`\nGộp xong: ${before} → ${byId.size} địa danh (bỏ thêm ${dropped} mục 'huyện').`);
