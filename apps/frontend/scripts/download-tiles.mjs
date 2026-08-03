// Tải tile nền offline. Kiểm nội dung tile (loại ảnh lỗi/trống).
// Chạy: node scripts/download-tiles.mjs
//
// Nguồn là CARTO voyager_nolabels — bản đồ KHÔNG CÓ CHỮ. Trước đây dùng style
// "openstreetmap" của MapTiler, nhưng tên địa danh được nung thẳng vào ảnh tile
// nên không tắt được bằng code: bản đồ điều phối bị "La Hai", "Long Châu",
// "Phước Lộc"... phủ kín, trong khi thứ cần thấy chỉ là kho và điểm sự cố.
// Đã thử backdrop/dataviz/basic-v2 của MapTiler, kiểu nào cũng còn nhãn.
//
// Hai tầng, khớp đúng giới hạn khung nhìn trong map-canvas.tsx:
//   z9-11  toàn tỉnh Đắk Lắk mới — z9 là mức thu nhỏ nhất, vừa đủ thấy trọn tỉnh
//          (tỉnh rộng 1.97°, khung ~1030px chứa 2.83° ở z9 nhưng chỉ 1.41° ở z10)
//   z12-15 đặc cho 5 xã cụm Đồng Xuân
// Tải rộng hơn hai tầng này là phí: mỗi mức zoom sâu thêm thì số ô nhân bốn.
// Script tự xoá ô nằm ngoài cấu hình, nên gói tile luôn khớp đúng thứ đang dùng.
import fs from "fs";
import path from "path";

// Raster 256px, cùng lưới XYZ chuẩn với Leaflet/OSM. Không cần API key.
const STYLE = "voyager_nolabels";
const SUBDOMAINS = ["a", "b", "c", "d"];
const tileUrl = (z, x, y) =>
  `https://${SUBDOMAINS[(x + y) % SUBDOMAINS.length]}.basemaps.cartocdn.com` +
  `/rastertiles/${STYLE}/${z}/${x}/${y}.png`;
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
  const url = tileUrl(z, x, y);
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
