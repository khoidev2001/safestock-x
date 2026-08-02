// Tải tile MapTiler offline. Có API key, hợp lệ. Kiểm nội dung tile (loại ảnh
// lỗi/trống). Chạy: node scripts/download-tiles.mjs
//
// Hai tầng, khớp đúng giới hạn khung nhìn trong map-canvas.tsx:
//   z9-11  toàn tỉnh Đắk Lắk mới — z9 là mức thu nhỏ nhất, vừa đủ thấy trọn tỉnh
//          (tỉnh rộng 1.97°, khung ~1030px chứa 2.83° ở z9 nhưng chỉ 1.41° ở z10)
//   z12-15 đặc cho 5 xã cụm Đồng Xuân
// Tải rộng hơn hai tầng này là phí: mỗi mức zoom sâu thêm thì số ô nhân bốn.
// Script tự xoá ô nằm ngoài cấu hình, nên gói tile luôn khớp đúng thứ đang dùng.
import fs from "fs";
import path from "path";

function readEnvValue(file, key) {
  if (!fs.existsSync(file)) return undefined;
  const line = fs
    .readFileSync(file, "utf8")
    .split(/\r?\n/)
    .find((value) => value.trim().startsWith(`${key}=`));
  return line
    ?.slice(line.indexOf("=") + 1)
    .trim()
    .replace(/^['"]|['"]$/g, "");
}

const KEY =
  process.env.NEXT_PUBLIC_MAPTILER_KEY ?? readEnvValue(".env.local", "NEXT_PUBLIC_MAPTILER_KEY");
if (!KEY) {
  console.error("Thiếu NEXT_PUBLIC_MAPTILER_KEY (đặt trong môi trường hoặc .env.local)");
  process.exit(1);
}

const STYLE = "openstreetmap"; // raster 256px chuẩn (khớp lưới OSM)
// [lngTây, latNam, lngĐông, latBắc]
// Ranh giới tỉnh thật là lng 107.4842..109.4590, lat 12.1605..13.6953 (đo từ
// public/geo/daklak-communes.geojson). Nới thêm cho đủ khung nhìn ở z9, vì khung
// rộng 2.83° còn tỉnh chỉ 1.97° — không nới thì mép trái phải lộ nền trống.
const TIERS = [
  { name: "toàn tỉnh Đắk Lắk", zoomMin: 9, zoomMax: 11, bbox: [106.9, 11.6, 110.0, 14.3] },
  {
    name: "5 xã cụm Đồng Xuân",
    zoomMin: 12,
    zoomMax: 15,
    bbox: [108.9483, 13.2393, 109.2551, 13.6202],
  },
];
const OUT = "public/tiles";
const DELAY_MS = 60;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const lon2x = (lon, z) => Math.floor(((lon + 180) / 360) * 2 ** z);
const lat2y = (lat, z) => {
  const r = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const jobs = [];
for (const tier of TIERS) {
  const before = jobs.length;
  for (let z = tier.zoomMin; z <= tier.zoomMax; z++) {
    const x0 = lon2x(tier.bbox[0], z),
      x1 = lon2x(tier.bbox[2], z);
    const y0 = lat2y(tier.bbox[3], z),
      y1 = lat2y(tier.bbox[1], z);
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) jobs.push({ z, x, y });
  }
  console.log(
    `  tầng ${tier.name}: zoom ${tier.zoomMin}-${tier.zoomMax}, ${jobs.length - before} tile`,
  );
}
console.log(`Tải ${jobs.length} tile MapTiler (${STYLE})...`);

function isValidTile(buffer) {
  return (
    buffer.length >= 24 &&
    buffer.subarray(0, 8).equals(PNG_SIGNATURE) &&
    buffer.readUInt32BE(16) === 256 &&
    buffer.readUInt32BE(20) === 256
  );
}

let done = 0,
  skipped = 0,
  failed = 0;
for (const { z, x, y } of jobs) {
  const dir = path.join(OUT, String(z), String(x));
  const file = path.join(dir, `${y}.png`);
  if (fs.existsSync(file) && isValidTile(fs.readFileSync(file))) {
    skipped++;
    done++;
    continue;
  }
  fs.mkdirSync(dir, { recursive: true });
  const url = `https://api.maptiler.com/maps/${STYLE}/256/${z}/${x}/${y}.png?key=${KEY}`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (!isValidTile(buf)) throw new Error("không phải PNG 256x256 hợp lệ");
    fs.writeFileSync(file, buf);
    done++;
    if (done % 150 === 0) console.log(`  ${done}/${jobs.length} (${skipped} cache, ${failed} lỗi)`);
    await sleep(DELAY_MS);
  } catch (e) {
    failed++;
    console.warn(`  lỗi ${z}/${x}/${y}: ${e.message}`);
    await sleep(DELAY_MS * 3);
  }
}
console.log(`Tải xong: ${done}/${jobs.length} tile hợp lệ, ${skipped} sẵn, ${failed} lỗi.`);

// Dọn ô ngoài cấu hình. Tile là dữ liệu dẫn xuất, tải lại được, nên giữ đúng phần
// đang dùng — thừa một mức zoom là thừa hàng nghìn tệp nằm trong repo mà không ai mở.
const wanted = new Set(jobs.map(({ z, x, y }) => `${z}/${x}/${y}`));
let removed = 0;
if (fs.existsSync(OUT)) {
  for (const z of fs.readdirSync(OUT)) {
    const zDir = path.join(OUT, z);
    if (!fs.statSync(zDir).isDirectory()) continue;
    for (const x of fs.readdirSync(zDir)) {
      const xDir = path.join(zDir, x);
      if (!fs.statSync(xDir).isDirectory()) continue;
      for (const file of fs.readdirSync(xDir)) {
        if (!file.endsWith(".png")) continue;
        if (wanted.has(`${z}/${x}/${file.slice(0, -4)}`)) continue;
        fs.rmSync(path.join(xDir, file));
        removed++;
      }
      if (fs.readdirSync(xDir).length === 0) fs.rmdirSync(xDir);
    }
    if (fs.readdirSync(zDir).length === 0) fs.rmdirSync(zDir);
  }
}
console.log(`Dọn ô ngoài cấu hình: xoá ${removed}. Gói còn ${jobs.length} tile.`);
if (failed > 0 || done !== jobs.length) process.exit(1);
