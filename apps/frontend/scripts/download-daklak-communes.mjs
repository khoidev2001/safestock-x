// Tải ranh giới hành chính 102 xã/phường tỉnh Đắk Lắk (sau sáp nhập 16/6/2025)
// từ OpenStreetMap qua Nominatim. Mỗi tên → 1 relation admin_level=6 trong Đắk Lắk.
// Chạy: node scripts/download-daklak-communes.mjs
import fs from "node:fs/promises";
import path from "node:path";
import officialManifest from "../data/daklak-official-units.json" with { type: "json" };

const OUTPUT = "public/geo/daklak-communes.geojson";
const USER_AGENT = "UngPhoNhanh-GIS/1.0 (Dak Lak boundary builder)";
const PROVINCE_HINT = "Đắk Lắk";
// Đơn giản hoá polygon để giữ file gọn (độ ~11m). Đủ mịn cho ranh giới xã.
const POLYGON_THRESHOLD = "0.0003";
const RATE_LIMIT_MS = 1200; // tôn trọng giới hạn Nominatim (1 req/s)

// Danh mục cấp xã chuẩn được đối chiếu từ sapnhap.bando.com.vn. Geometry vẫn
// tải từ OSM để giữ đúng giấy phép ODbL của artifact phát hành.
const UNITS = officialManifest.units;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function nominatim(pathname, params) {
  const url = new URL(`https://nominatim.openstreetmap.org/${pathname}`);
  url.search = new URLSearchParams(params).toString();
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Chuẩn hoá tên để so khớp (bỏ khoảng trắng thừa, thường hoá).
const norm = (s) => (s ?? "").normalize("NFC").trim().toLowerCase();

async function resolveUnit(fullName) {
  // Tìm theo tên + tỉnh; lọc relation admin_level=6 trong Đắk Lắk.
  const results = await nominatim("search", {
    q: `${fullName}, ${PROVINCE_HINT}`,
    format: "jsonv2",
    limit: "8",
    addressdetails: "1",
    extratags: "1",
    "accept-language": "vi",
  });
  const candidates = results.filter((r) => {
    const lvl = r.extratags?.admin_level;
    const inProvince = norm(r.display_name).includes("đắk lắk");
    return r.osm_type === "relation" && lvl === "6" && inProvince;
  });
  // Ưu tiên khớp tên chính xác.
  const exact = candidates.find((r) => norm(r.display_name).startsWith(norm(fullName)));
  return exact ?? candidates[0] ?? null;
}

async function fetchBoundary(osmId) {
  const detail = await nominatim("details", {
    osmtype: "R",
    osmid: String(osmId),
    format: "json",
    polygon_geojson: "1",
    polygon_threshold: POLYGON_THRESHOLD,
  });
  const geometry = detail.geometry;
  if (!geometry || !["Polygon", "MultiPolygon"].includes(geometry.type)) {
    throw new Error("không có polygon");
  }
  return { geometry, adminLevel: detail.extratags?.admin_level, localname: detail.localname };
}

const features = [];
const failures = [];
const seenIds = new Set();

for (let i = 0; i < UNITS.length; i++) {
  const officialUnit = UNITS[i];
  const fullName = officialUnit.name;
  const shortName = fullName.replace(/^(Xã|Phường|Thị trấn)\s+/, "");
  try {
    const hit = await resolveUnit(fullName);
    await sleep(RATE_LIMIT_MS);
    if (!hit) {
      failures.push({ fullName, reason: "không tìm thấy relation admin_level=6" });
      console.warn(`✗ [${i + 1}/102] ${fullName}: không tìm thấy`);
      continue;
    }
    if (seenIds.has(hit.osm_id)) {
      failures.push({ fullName, reason: `trùng relation ${hit.osm_id}` });
      console.warn(`✗ [${i + 1}/102] ${fullName}: trùng relation ${hit.osm_id}`);
      continue;
    }
    const { geometry, localname } = await fetchBoundary(hit.osm_id);
    await sleep(RATE_LIMIT_MS);
    seenIds.add(hit.osm_id);
    features.push({
      type: "Feature",
      properties: {
        name: shortName,
        fullName,
        osmName: localname ?? null,
        source: "OpenStreetMap",
        osmType: "relation",
        osmId: hit.osm_id,
        adminLevel: 6,
        officialCode: officialUnit.code,
        officialMapId: officialUnit.mapId,
      },
      geometry,
    });
    console.log(`✓ [${i + 1}/102] ${fullName} → R${hit.osm_id}`);
  } catch (err) {
    failures.push({ fullName, reason: String(err.message ?? err) });
    console.warn(`✗ [${i + 1}/102] ${fullName}: ${err.message ?? err}`);
  }
}

const collection = {
  type: "FeatureCollection",
  name: "Ranh giới 102 xã/phường tỉnh Đắk Lắk (OSM)",
  source: "OpenStreetMap contributors",
  license: "ODbL 1.0",
  generatedAt: new Date().toISOString(),
  features,
};

await fs.mkdir(path.dirname(OUTPUT), { recursive: true });
await fs.writeFile(OUTPUT, `${JSON.stringify(collection)}\n`, "utf8");
console.log(`\nĐã ghi ${features.length}/102 ranh giới vào ${OUTPUT}.`);
if (failures.length) {
  console.log(`\n${failures.length} đơn vị CẦN XỬ LÝ TAY:`);
  for (const f of failures) console.log(`  - ${f.fullName}: ${f.reason}`);
}
