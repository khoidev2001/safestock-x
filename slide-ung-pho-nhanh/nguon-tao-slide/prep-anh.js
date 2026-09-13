// Cắt ảnh thực tế trong anh/ về đúng tỷ lệ từng khung slide -> anh/da-cat/<slot>.jpg (ảnh chụp màn hình: .png)
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const PHOTOS = require('./anh-config');

const SRC = 'anh', OUT = 'anh/da-cat', DPI = 200, SHOT_SCALE = 2;
const EXT = ['.jpg', '.jpeg', '.png', '.webp', '.heic'];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  let done = 0, missing = [];
  for (const [slot, { w, h, position, extract, format, src: base = slot, dpi = DPI }] of Object.entries(PHOTOS)) {
    // src: tên ảnh gốc khi nhiều khung cùng cắt từ một ảnh (mặc định trùng tên khung)
    const src = EXT.map((e) => path.join(SRC, base + e)).find((f) => fs.existsSync(f));
    if (!src) { missing.push(slot); continue; }
    const img = sharp(src).rotate(); // tôn trọng hướng ảnh chụp từ điện thoại
    if (extract) img.extract(extract); // cắt sẵn một vùng của ảnh gốc (vd bỏ lề trắng bản scan)
    // Ảnh chụp màn hình (.png): chữ nhỏ và nét mảnh, JPEG làm nhoè cạnh chữ và ảnh gốc thường chỉ ~130–170 px/in trên
    // slide nên máy chiếu 1920px phải phóng to -> mờ. Xuất PNG không mất nét, phóng đúng SHOT_SCALE lần (lanczos3) từ
    // đúng số px gốc để khỏi co giãn lẻ; ảnh chụp thật (.jpg) giữ JPEG như cũ.
    // format: 'jpg' cho ảnh chụp thật lỡ lưu dạng .png (vd dán từ clipboard) để khỏi thành PNG nặng
    const shot = format ? format === 'png' : src.endsWith('.png');
    // ảnh chụp màn hình ít điểm ảnh (dưới 190 px/in trên slide, vd ảnh điện thoại ~440px) phóng 3 lần, còn lại 2 lần;
    // làm sắc nhẹ sau khi phóng để cạnh chữ không nhoè khi chiếu trên màn hình độ phân giải cao
    const scale = dpi < 190 ? 3 : SHOT_SCALE;
    const d = shot ? dpi * scale : dpi;
    let out = img.resize(Math.round(w * d), Math.round(h * d), { fit: 'cover', position: position || 'attention', kernel: 'lanczos3' });
    if (shot) out = out.sharpen({ sigma: 1.1, m1: 0.6, m2: 2.2 });
    const file = path.join(OUT, slot + (shot ? '.png' : '.jpg'));
    for (const old of ['.png', '.jpg'].map((e) => path.join(OUT, slot + e))) if (old !== file && fs.existsSync(old)) fs.unlinkSync(old);
    await (shot ? out.png({ compressionLevel: 9 }) : out.jpeg({ quality: 88 })).toFile(file);
    console.log('✓', slot, '<-', src);
    done++;
  }
  console.log(`\nđã cắt ${done} ảnh.`);
  if (missing.length) console.log('chưa có ảnh cho:', missing.join(', '));
})();
