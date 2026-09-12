// Thêm hiệu ứng chuyển slide (Fade) vào file .pptx đã render.
// Chạy sau render-pptx.js. Chạy lại nhiều lần không bị cộng dồn.
//
// Muốn bỏ hiệu ứng: chạy `node render-pptx.js` lại và đừng chạy script này.
const fs = require('fs');
const JSZip = require('jszip');

const FILE = 'Ung-Pho-Nhanh-Slide.pptx';
// spd: slow | med | fast — dùng med cho mượt mà không làm chậm nhịp nói.
const TRANSITION = '<p:transition spd="med"><p:fade/></p:transition>';

(async () => {
  const zip = await JSZip.loadAsync(fs.readFileSync(FILE));
  const names = Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n));
  let n = 0;
  for (const name of names) {
    let xml = await zip.file(name).async('string');
    xml = xml.replace(/<p:transition[\s\S]*?<\/p:transition>/g, ''); // bỏ hiệu ứng cũ nếu có
    if (!xml.includes('</p:sld>')) throw new Error('không nhận ra cấu trúc slide: ' + name);
    // theo lược đồ OOXML, p:transition đứng sau p:clrMapOvr và trước khi đóng p:sld
    xml = xml.replace('</p:sld>', TRANSITION + '</p:sld>');
    zip.file(name, xml);
    n++;
  }
  const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  fs.writeFileSync(FILE, buf);
  console.log(`đã thêm hiệu ứng chuyển slide cho ${n} slide.`);
})();
