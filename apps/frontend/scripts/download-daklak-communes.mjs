// Tải ranh giới hành chính 102 xã/phường tỉnh Đắk Lắk (sau sáp nhập 16/6/2025)
// từ OpenStreetMap qua Nominatim. Mỗi tên → 1 relation admin_level=6 trong Đắk Lắk.
// Chạy: node scripts/download-daklak-communes.mjs
import fs from "node:fs/promises";
import path from "node:path";

const OUTPUT = "public/geo/daklak-communes.geojson";
const USER_AGENT = "UngPhoNhanh-GIS/1.0 (Dak Lak boundary builder)";
const PROVINCE_HINT = "Đắk Lắk";
// Đơn giản hoá polygon để giữ file gọn (độ ~11m). Đủ mịn cho ranh giới xã.
const POLYGON_THRESHOLD = "0.0003";
const RATE_LIMIT_MS = 1200; // tôn trọng giới hạn Nominatim (1 req/s)

// 102 đơn vị hành chính cấp xã (Nghị quyết 1660/NQ-UBTVQH15). Nguồn: TTXVN.
const UNITS = [
  "Xã Hòa Phú", "Xã Ea Drông", "Xã Ea Súp", "Xã Ea Rốk", "Xã Ea Bung",
  "Xã Ea Wer", "Xã Ea Nuôl", "Xã Ea Kiết", "Xã Ea M'droh", "Xã Quảng Phú",
  "Xã Cuôr Đăng", "Xã Cư M'gar", "Xã Ea Tul", "Xã Pơng Drang", "Xã Krông Búk",
  "Xã Cư Pơng", "Xã Ea Khảl", "Xã Ea Drăng", "Xã Ea Wy", "Xã Ea Hiao",
  "Xã Krông Năng", "Xã Dliê Ya", "Xã Tam Giang", "Xã Phú Xuân", "Xã Krông Pắc",
  "Xã Ea Knuếc", "Xã Tân Tiến", "Xã Ea Phê", "Xã Ea Kly", "Xã Ea Kar",
  "Xã Ea Ô", "Xã Ea Knốp", "Xã Cư Yang", "Xã Ea Pắl", "Xã M'Drắk",
  "Xã Ea Riêng", "Xã Cư M'ta", "Xã Krông Á", "Xã Cư Prao", "Xã Hòa Sơn",
  "Xã Đang Kang", "Xã Krông Bông", "Xã Yang Mao", "Xã Cư Pui", "Xã Liên Sơn Lắk",
  "Xã Đắk Liêng", "Xã Nam Ka", "Xã Đắk Phơi", "Xã Ea Ning", "Xã Dray Bhăng",
  "Xã Ea Ktur", "Xã Krông Ana", "Xã Dur Kmăl", "Xã Ea Na", "Xã Xuân Thọ",
  "Xã Xuân Cảnh", "Xã Xuân Lộc", "Xã Hòa Xuân", "Xã Tuy An Bắc", "Xã Tuy An Đông",
  "Xã Ô Loan", "Xã Tuy An Nam", "Xã Tuy An Tây", "Xã Phú Hòa 1", "Xã Phú Hòa 2",
  "Xã Tây Hòa", "Xã Hòa Thịnh", "Xã Hòa Mỹ", "Xã Sơn Thành", "Xã Sơn Hòa",
  "Xã Vân Hòa", "Xã Tây Sơn", "Xã Suối Trai", "Xã Ea Ly", "Xã Ea Bá",
  "Xã Đức Bình", "Xã Sông Hinh", "Xã Xuân Lãnh", "Xã Phú Mỡ", "Xã Xuân Phước",
  "Xã Đồng Xuân", "Phường Buôn Ma Thuột", "Phường Tân An", "Phường Tân Lập",
  "Phường Thành Nhất", "Phường Ea Kao", "Phường Buôn Hồ", "Phường Cư Bao",
  "Phường Phú Yên", "Phường Tuy Hòa", "Phường Bình Kiến", "Phường Xuân Đài",
  "Phường Sông Cầu", "Phường Đông Hòa", "Phường Hòa Hiệp", "Xã Buôn Đôn",
  "Xã Ea H'leo", "Xã Ea Trang", "Xã Ia Lốp", "Xã Ia RVê", "Xã Krông Nô",
  "Xã Vụ Bổn",
];

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
  const fullName = UNITS[i];
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
