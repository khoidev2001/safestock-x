// Preview renderer: same spec -> PNG, for visual QA only.
const fs = require('fs');
const sharp = require('sharp');
const { SW, SH, SVG_WEIGHT, ascentOf } = require('./core');
const slides = require('./slides');

const S = 128; // px per inch
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const dataUri = (f) => {
  const ext = f.endsWith('.png') ? 'png' : 'jpeg';
  return `data:image/${ext};base64,` + fs.readFileSync(f).toString('base64');
};
const cache = {};
const uri = (f) => (cache[f] = cache[f] || dataUri(f));

function svgFor(slide) {
  const parts = [];
  for (const e of slide.els) {
    if (e.t === 'img') {
      parts.push(`<image href="${uri(e.src)}" x="${e.x * S}" y="${e.y * S}" width="${e.w * S}" height="${e.h * S}" preserveAspectRatio="none"/>`);
    } else if (e.t === 'rect') {
      const st = e.line ? ` stroke="${e.line.color}" stroke-opacity="${e.line.alpha}" stroke-width="${e.line.w || 1}"` : '';
      parts.push(`<rect x="${e.x * S}" y="${e.y * S}" width="${e.w * S}" height="${e.h * S}" rx="${(e.r || 0) * S}" fill="${e.fill}" fill-opacity="${e.alpha}"${st}/>`);
    } else if (e.t === 'tri') {
      const x = e.x * S, y = e.y * S, w = e.w * S, h = e.h * S;
      const pts = e.dir === 'down'
        ? `${x},${y} ${x + w},${y} ${x + w / 2},${y + h}`
        : e.dir === 'left'
          ? `${x + w},${y} ${x},${y + h / 2} ${x + w},${y + h}`
          : `${x},${y} ${x + w},${y + h / 2} ${x},${y + h}`;
      parts.push(`<polygon points="${pts}" fill="${e.fill}" fill-opacity="${e.alpha}"/>`);
    } else if (e.t === 'text') {
      const asc = ascentOf(e.size, e.weight);
      const anchor = e.align === 'center' ? 'middle' : e.align === 'right' ? 'end' : 'start';
      const tx = (e.align === 'center' ? e.x + e.w / 2 : e.align === 'right' ? e.x + e.w : e.x) * S;
      e.lines.forEach((ln, i) => {
        const by = (e.y + asc + i * e.lineH) * S;
        parts.push(`<text x="${tx}" y="${by}" font-family="Be Vietnam Pro" font-weight="${SVG_WEIGHT[e.weight]}" font-size="${(e.size / 72) * S}" fill="${e.color}" text-anchor="${anchor}"${e.spacing ? ` letter-spacing="${(e.spacing / 72) * S}"` : ''}>${esc(ln)}</text>`);
      });
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SW * S}" height="${SH * S}"><rect width="100%" height="100%" fill="#04101F"/>${parts.join('')}</svg>`;
}

(async () => {
  fs.mkdirSync('preview', { recursive: true });
  for (let i = 0; i < slides.length; i++) {
    await sharp(Buffer.from(svgFor(slides[i])), { density: 96 })
      .png({ compressionLevel: 9 }).toFile(`preview/slide-${String(i + 1).padStart(2, '0')}.png`);
  }
  console.log('preview rendered:', slides.length);
})();
