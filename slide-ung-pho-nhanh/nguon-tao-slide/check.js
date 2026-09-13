// kiểm tra phần tử tràn xuống dưới vạch chân trang (bỏ qua nền và chrome)
const slides = require('./slides');
const LIMIT = 6.82;
let bad = 0;
slides.forEach((s, i) => s.els.forEach((e) => {
  const full = e.w >= 13 && e.h >= 7;           // ảnh nền / lớp phủ
  const chromeRule = e.t === 'rect' && Math.abs(e.y + e.h - 6.87) < 0.02;
  // chân trang: địa chỉ web bên phải, dòng nguồn ảnh (nếu có) bên trái
  const footer = e.t === 'text' && e.lines && (e.lines[0] === 'ungphonhanh.life' || (e.y >= 6.95 && /^Nguồn/.test(e.lines[0])));
  if (full || chromeRule || footer) return;
  const bot = e.y + (e.h || 0);
  if (bot > LIMIT) { bad++; console.log(`slide${i + 1} ${e.t} đáy ${bot.toFixed(2)}`, e.t === 'text' ? JSON.stringify(e.lines[0]).slice(0, 45) : ''); }
}));
// dòng chữ dài hơn khung (thường do tự ngắt dòng bằng lines): PowerPoint sẽ tự xuống dòng và đẩy chữ tràn khỏi khung
const { widthOf } = require('./core');
slides.forEach((s, i) => s.els.forEach((e) => {
  if (e.t !== 'text') return;
  for (const ln of e.lines) {
    const lw = widthOf(ln, e.size, e.weight, e.spacing || 0);
    if (lw > e.w + 0.1) { bad++; console.log(`slide${i + 1} dòng rộng ${lw.toFixed(2)} > khung ${e.w.toFixed(2)}:`, JSON.stringify(ln).slice(0, 60)); }
  }
}));
console.log(bad ? `${bad} phần tử tràn` : `✓ ${slides.length} slide sạch`);
