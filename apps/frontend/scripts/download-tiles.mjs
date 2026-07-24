// Tải tile MapTiler offline cho 5 xã cụm Đồng Xuân (zoom 10-15). Có API key, hợp lệ.
// Kiểm nội dung tile (loại ảnh lỗi/trống). Chạy: node scripts/download-tiles.mjs
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
const BBOX = [108.9483, 13.2393, 109.2551, 13.6202]; // 5 xã
const ZOOM_MIN = 10,
  ZOOM_MAX = 15;
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
for (let z = ZOOM_MIN; z <= ZOOM_MAX; z++) {
  const x0 = lon2x(BBOX[0], z),
    x1 = lon2x(BBOX[2], z);
  const y0 = lat2y(BBOX[3], z),
    y1 = lat2y(BBOX[1], z);
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) jobs.push({ z, x, y });
}
console.log(`Tải ${jobs.length} tile MapTiler (${STYLE}, zoom ${ZOOM_MIN}-${ZOOM_MAX})...`);

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
console.log(`XONG: ${done}/${jobs.length} tile hợp lệ, ${skipped} sẵn, ${failed} lỗi.`);
if (failed > 0 || done !== jobs.length) process.exit(1);
