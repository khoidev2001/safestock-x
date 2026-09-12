// Vector PDF with embedded Be Vietnam Pro - text stays selectable.
const fs = require('fs');
const PDFDocument = require('pdfkit');
const { SW, SH, IN, FONTS, widthOf } = require('./core');
const slides = require('./slides');

const doc = new PDFDocument({ size: [SW * IN, SH * IN], margin: 0, autoFirstPage: false,
  info: { Title: 'Ứng Phó Nhanh — Giải pháp cứu hộ, cứu nạn và hậu cần thông minh', Author: 'Nhóm Ứng Phó Nhanh' } });
doc.pipe(fs.createWriteStream('Ung-Pho-Nhanh-Slide.pdf'));
for (const [k, f] of Object.entries(FONTS)) doc.registerFont(k, f);

for (const slide of slides) {
  doc.addPage();
  doc.rect(0, 0, SW * IN, SH * IN).fill('#04101F');
  for (const e of slide.els) {
    if (e.t === 'img') {
      doc.image(e.src, e.x * IN, e.y * IN, { width: e.w * IN, height: e.h * IN });
    } else if (e.t === 'rect') {
      doc.save();
      const x = e.x * IN, y = e.y * IN, w = e.w * IN, h = e.h * IN, r = (e.r || 0) * IN;
      if (r > 0) doc.roundedRect(x, y, w, h, r); else doc.rect(x, y, w, h);
      doc.fillOpacity(e.alpha).fill(e.fill);
      if (e.line) {
        if (r > 0) doc.roundedRect(x, y, w, h, r); else doc.rect(x, y, w, h);
        doc.strokeOpacity(e.line.alpha).lineWidth(e.line.w || 1).stroke(e.line.color);
      }
      doc.restore();
    } else if (e.t === 'tri') {
      const x = e.x * IN, y = e.y * IN, w = e.w * IN, h = e.h * IN;
      doc.save().fillOpacity(e.alpha);
      if (e.dir === 'down') doc.moveTo(x, y).lineTo(x + w, y).lineTo(x + w / 2, y + h);
      else if (e.dir === 'left') doc.moveTo(x + w, y).lineTo(x, y + h / 2).lineTo(x + w, y + h);
      else doc.moveTo(x, y).lineTo(x + w, y + h / 2).lineTo(x, y + h);
      doc.closePath().fill(e.fill).restore();
    } else if (e.t === 'text') {
      doc.save().font(e.weight).fontSize(e.size).fillColor(e.color).fillOpacity(1);
      e.lines.forEach((ln, i) => {
        if (!ln) return;
        // align by hand so PDF and PPTX land on the same pixels
        const lw = widthOf(ln, e.size, e.weight, e.spacing || 0);
        const tx = e.align === 'center' ? e.x + (e.w - lw) / 2
          : e.align === 'right' ? e.x + e.w - lw : e.x;
        doc.text(ln, tx * IN, (e.y + i * e.lineH) * IN, {
          lineBreak: false, characterSpacing: e.spacing || 0, baseline: 'top',
        });
      });
      doc.restore();
    }
  }
}
doc.end();
console.log('pdf written');
