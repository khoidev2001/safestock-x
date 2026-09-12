// kiểm tra phần tử tràn xuống dưới vạch chân trang (bỏ qua nền và chrome)
const slides = require('./slides');
const LIMIT = 6.82;
let bad = 0;
slides.forEach((s, i) => s.els.forEach((e) => {
  const full = e.w >= 13 && e.h >= 7;           // ảnh nền / lớp phủ
  const chromeRule = e.t === 'rect' && Math.abs(e.y + e.h - 6.87) < 0.02;
  const footer = e.t === 'text' && e.lines && e.lines[0] === 'ungphonhanh.life';
  if (full || chromeRule || footer) return;
  const bot = e.y + (e.h || 0);
  if (bot > LIMIT) { bad++; console.log(`slide${i + 1} ${e.t} đáy ${bot.toFixed(2)}`, e.t === 'text' ? JSON.stringify(e.lines[0]).slice(0, 45) : ''); }
}));
console.log(bad ? `${bad} phần tử tràn` : `✓ ${slides.length} slide sạch`);
