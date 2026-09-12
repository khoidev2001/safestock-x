// Cắt ảnh thực tế trong anh/ về đúng tỷ lệ từng khung slide -> anh/da-cat/<slot>.jpg
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const PHOTOS = require('./anh-config');

const SRC = 'anh', OUT = 'anh/da-cat', DPI = 200;
const EXT = ['.jpg', '.jpeg', '.png', '.webp', '.heic'];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  let done = 0, missing = [];
  for (const [slot, { w, h, position }] of Object.entries(PHOTOS)) {
    const src = EXT.map((e) => path.join(SRC, slot + e)).find((f) => fs.existsSync(f));
    if (!src) { missing.push(slot); continue; }
    await sharp(src)
      .rotate() // tôn trọng hướng ảnh chụp từ điện thoại
      .resize(Math.round(w * DPI), Math.round(h * DPI), { fit: 'cover', position: position || 'attention' })
      .jpeg({ quality: 88 })
      .toFile(path.join(OUT, slot + '.jpg'));
    console.log('✓', slot, '<-', src);
    done++;
  }
  console.log(`\nđã cắt ${done} ảnh.`);
  if (missing.length) console.log('chưa có ảnh cho:', missing.join(', '));
})();
