// Editable PowerPoint: every text block stays a real text box in Be Vietnam Pro.
const pptxgen = require('pptxgenjs');
const { SW, SH, PPT_BOLD } = require('./core');
const slides = require('./slides');

const FONT = 'Be Vietnam Pro';
const hex = (c) => c.replace('#', '').toUpperCase();
const transp = (alpha) => Math.round((1 - alpha) * 100);

const pres = new pptxgen();
pres.defineLayout({ name: 'UPN16x9', width: SW, height: SH });
pres.layout = 'UPN16x9';
pres.author = 'Nhóm Ứng Phó Nhanh';
pres.title = 'Ứng Phó Nhanh — Giải pháp cứu hộ, cứu nạn và hậu cần thông minh';

slides.forEach((s, idx) => {
  const slide = pres.addSlide();
  slide.background = { color: '04101F' };

  for (const e of s.els) {
    if (e.t === 'img') {
      slide.addImage({ path: e.src, x: e.x, y: e.y, w: e.w, h: e.h });
    } else if (e.t === 'rect') {
      slide.addShape(e.r > 0 ? pres.ShapeType.roundRect : pres.ShapeType.rect, {
        x: e.x, y: e.y, w: e.w, h: e.h,
        rectRadius: e.r > 0 ? e.r : undefined,
        fill: { color: hex(e.fill), transparency: transp(e.alpha) },
        line: e.line
          ? { color: hex(e.line.color), width: e.line.w || 1, transparency: transp(e.line.alpha) }
          : { type: 'none' },
      });
    } else if (e.t === 'tri') {
      const d = Math.max(e.w, e.h), cx = e.x + e.w / 2, cy = e.y + e.h / 2;
      slide.addShape(pres.ShapeType.triangle, {
        x: cx - d / 2, y: cy - d / 2, w: d, h: d, rotate: e.dir === 'down' ? 180 : e.dir === 'left' ? 270 : 90,
        fill: { color: hex(e.fill), transparency: transp(e.alpha) },
        line: { type: 'none' },
      });
    } else if (e.t === 'text') {
      // a little slack so PowerPoint never re-wraps a line that already fits
      const pad = 0.1;
      const x = e.align === 'center' ? e.x - pad / 2 : e.align === 'right' ? e.x - pad : e.x;
      slide.addText(e.lines.join('\n'), {
        x, y: e.y - 0.02, w: e.w + pad, h: e.h + 0.08,
        fontFace: FONT, fontSize: e.size, bold: PPT_BOLD[e.weight],
        color: hex(e.color), align: e.align, valign: 'top',
        margin: 0, lineSpacing: e.size * e.lh,
        charSpacing: e.spacing || undefined, wrap: true,
      });
    }
  }
  if (s.notes) slide.addNotes(s.notes);
});

pres.writeFile({ fileName: 'Ung-Pho-Nhanh-Slide.pptx' }).then((f) => console.log('pptx written:', f));
