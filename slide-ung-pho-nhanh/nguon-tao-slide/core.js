// Shared geometry, tokens and text measuring for the Ung Pho Nhanh deck.
const PDFDocument = require('pdfkit');

const SW = 13.333, SH = 7.5, M = 0.78;
const IN = 72; // points per inch

const FONTS = {
  r: 'fonts/BeVietnamPro-Regular.ttf',
  m: 'fonts/BeVietnamPro-Medium.ttf',
  sb: 'fonts/BeVietnamPro-SemiBold.ttf',
  b: 'fonts/BeVietnamPro-Bold.ttf',
  eb: 'fonts/BeVietnamPro-ExtraBold.ttf',
};

const SVG_WEIGHT = { r: 400, m: 500, sb: 600, b: 700, eb: 800 };
const PPT_BOLD = { r: false, m: false, sb: true, b: true, eb: true };

const C = {
  ink: '#04101F',
  card: '#091B2D',
  white: '#FFFFFF',
  text: '#D9E6F2',
  muted: '#9BB0C6',
  dim: '#7189A2',
  green: '#22C55E',
  greenSoft: '#6EE7A8',
  greenDeep: '#0B5F32',
  amber: '#FBBF24',
  orange: '#FB923C',
  sky: '#38BDF8',
  red: '#F87171',
};

// --- measuring -------------------------------------------------------------
const _doc = new PDFDocument({ autoFirstPage: false });
for (const [k, f] of Object.entries(FONTS)) _doc.registerFont(k, f);

function widthOf(text, size, weight, spacing = 0) {
  _doc.font(weight).fontSize(size);
  return _doc.widthOfString(text, { characterSpacing: spacing }) / IN; // inches
}
function ascentOf(size, weight) {
  _doc.font(weight);
  return (_doc._font.ascender / 1000) * size / IN; // inches
}

function wrap(text, size, weight, maxW, spacing = 0) {
  const out = [];
  for (const para of String(text).split('\n')) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) { out.push(''); continue; }
    let line = words[0];
    for (let i = 1; i < words.length; i++) {
      const test = line + ' ' + words[i];
      if (widthOf(test, size, weight, spacing) <= maxW) line = test;
      else { out.push(line); line = words[i]; }
    }
    out.push(line);
  }
  return out;
}

// --- element builders ------------------------------------------------------
const img = (src, x, y, w, h) => ({ t: 'img', src, x, y, w, h });
const rect = (x, y, w, h, fill, alpha = 1, r = 0, line = null) =>
  ({ t: 'rect', x, y, w, h, fill, alpha, r, line });

function txt(o) {
  const size = o.size || 14, weight = o.weight || 'r', lh = o.lh || 1.35;
  const spacing = o.spacing || 0;
  const lines = o.lines || wrap(o.text, size, weight, o.w, spacing);
  const lineH = (size * lh) / IN;
  return {
    t: 'text', x: o.x, y: o.y, w: o.w, lines, size, weight, lh, spacing,
    color: o.color || C.text, align: o.align || 'left',
    h: lines.length * lineH, lineH,
  };
}
const textH = (text, size, weight, w, lh = 1.35) =>
  wrap(text, size, weight, w).length * (size * lh) / IN;

module.exports = { SW, SH, M, IN, FONTS, SVG_WEIGHT, PPT_BOLD, C, widthOf, ascentOf, wrap, img, rect, txt, textH };
