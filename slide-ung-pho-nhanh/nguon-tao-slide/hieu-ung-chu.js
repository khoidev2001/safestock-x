// Sinh hiệu ứng xuất hiện dần (Fade in) cho từng khối nội dung của mỗi slide,
// rồi chèn vào file .pptx đã render. Chạy lại nhiều lần không bị cộng dồn.
//
// Nguyên tắc:
//  - Phần khung cố định (nền, logo, số trang, vạch kẻ, chân trang) hiện sẵn, không animate.
//  - Phần nội dung được gom thành từng khối (mỗi thẻ / mỗi ô là một khối) rồi hiện lần lượt
//    theo đúng thứ tự đọc, tự chạy khi vào slide — người nói chỉ bấm để sang slide sau.
//
// Bỏ hiệu ứng: chạy lại `node render-pptx.js` và không chạy script này.
const fs = require('fs');
const JSZip = require('jszip');
const slides = require('./slides');

const FILE = 'Ung-Pho-Nhanh-Slide.pptx';
const DUR = 400;        // thời gian mờ dần của một khối (ms)
const MAX_BUILD = 2400; // toàn slide phải hiện xong trong khoảng này (ms)
const MAX_STEP = 220;   // giãn cách tối đa giữa hai khối (ms)

// --- phần khung cố định, luôn hiện sẵn ---
function isStatic(e) {
  if (e.w >= 13 && e.h >= 7) return true;                          // nền, scrim, lớp phủ
  if (e.t === 'img' && /mark-sm|logo-sm/.test(e.src)) return true; // logo thương hiệu
  if (e.t === 'rect' && e.h <= 0.02) return true;                  // vạch kẻ mảnh
  if (e.t === 'text') {
    const s = (e.lines && e.lines[0]) || '';
    if (s === 'ungphonhanh.life') return true;
    if (/^\d{2} \/ \d{2}$/.test(s)) return true;
    if (s === 'ỨNG PHÓ NHANH' && e.size <= 14) return true;
  }
  return false;
}

const boxOf = (e) => ({ x: e.x, y: e.y, w: e.w, h: e.h || 0 });
const inside = (b, e) => {
  const cx = e.x + e.w / 2, cy = e.y + (e.h || 0) / 2;
  return cx >= b.x - 0.02 && cx <= b.x + b.w + 0.02 && cy >= b.y - 0.02 && cy <= b.y + b.h + 0.02;
};

// Gom các phần tử thành khối: thẻ/ô là "vật chứa", chữ nằm trong nó thuộc cùng khối.
function groupsOf(els) {
  const stat = els.map(isStatic);
  // khung nền của logo (chữ nhật bao trọn một ảnh cố định) cũng coi là cố định
  els.forEach((e, i) => {
    if (stat[i] || e.t !== 'rect') return;
    if (els.some((o, j) => stat[j] && o.t === 'img' && o.x >= e.x && o.y >= e.y
      && o.x + o.w <= e.x + e.w && o.y + o.h <= e.y + e.h)) stat[i] = true;
  });

  const isBoxEl = (e) => e.t === 'rect' && e.w >= 0.7 && e.h >= 0.25 && e.w < 13;
  const isPicEl = (e) => e.t === 'img';
  // Biết trước TẤT CẢ vật chứa, kể cả những cái được vẽ sau — mũi tên trong slide quy trình
  // nằm trước các thẻ bước, nếu chỉ nhìn vật chứa đã gặp thì sẽ gán sai.
  const boxes = [];
  els.forEach((e, i) => {
    if (stat[i] || !(isBoxEl(e) || isPicEl(e))) return;
    const b = boxOf(e);
    boxes.push({ i, box: isPicEl(e) ? { ...b, h: b.h + 0.4 } : b });
  });
  const distTo = (box, e) => {
    const cx = e.x + e.w / 2, cy = e.y + (e.h || 0) / 2;
    return Math.hypot(Math.max(box.x - cx, 0, cx - (box.x + box.w)),
                      Math.max(box.y - cy, 0, cy - (box.y + box.h)));
  };

  const groups = [];
  const giOf = {};      // vị trí phần tử vật chứa -> số thứ tự khối
  const seen = [];      // các vật chứa đã gặp, để gán chữ nằm bên trong
  const defer = [];     // [vị trí mũi tên, vị trí vật chứa đích]
  let prevGi = -1;

  els.forEach((e, i) => {
    if (stat[i]) return;
    // viền vẽ trùng khít lên phần tử trước (viền ảnh) phải hiện cùng nó
    const p = els[i - 1];
    if (e.t === 'rect' && p && prevGi >= 0 && Math.abs(p.x - e.x) < 0.03 && Math.abs(p.y - e.y) < 0.03
      && Math.abs(p.w - e.w) < 0.03 && Math.abs((p.h || 0) - (e.h || 0)) < 0.03) {
      groups[prevGi].push(i); return;
    }
    if (isBoxEl(e) || isPicEl(e)) {
      groups.push([i]);
      giOf[i] = groups.length - 1;
      seen.push(boxes.find((b) => b.i === i));
      prevGi = groups.length - 1;
      return;
    }
    // Mũi tên / gạch nối mảnh: bám vào thẻ gần nhất. Hai thẻ cách đều thì chọn thẻ vẽ sau
    // — đúng thẻ mà mũi tên trỏ tới.
    const thin = e.t === 'tri' || (e.t === 'rect' && (e.w < 0.12 || (e.h || 0) < 0.12));
    if (thin && boxes.length) {
      const d = boxes.map((b) => distTo(b.box, e));
      const best = Math.min(...d);
      let pick = 0;
      boxes.forEach((b, k) => { if (d[k] <= best + 0.25 && b.i > boxes[pick].i) pick = k; });
      defer.push([i, boxes[pick].i]);
      return;
    }
    // chữ nằm trong một thẻ đã gặp
    for (let k = seen.length - 1; k >= 0; k--) {
      if (inside(seen[k].box, e)) { groups[giOf[seen[k].i]].push(i); prevGi = giOf[seen[k].i]; return; }
    }
    const small = e.w < 0.7 || (e.h || 0) < 0.4;
    if (small && groups.length) groups[groups.length - 1].push(i);
    else groups.push([i]);
    prevGi = groups.length - 1;
  });

  for (const [i, target] of defer) groups[giOf[target]].push(i);
  return groups.filter((g) => g.length).map((g) => g.sort((a, b) => a - b));
}

// --- sinh XML p:timing ---
function timingXml(groups) {
  const step = Math.min(MAX_STEP, Math.max(60, Math.floor(MAX_BUILD / Math.max(1, groups.length))));
  let id = 5; // 1..4 đã dùng cho các nút bao ngoài
  const effects = groups.map((g, gi) => {
    const delay = gi * step;
    return g.map((elIdx) => {
      const spid = elIdx + 2; // pptxgenjs: id hình = vị trí phần tử + 2
      const a = id++, b = id++, c = id++;
      return `<p:par><p:cTn id="${a}" presetID="10" presetClass="entr" presetSubtype="0" fill="hold" grpId="0" nodeType="withEffect">`
        + `<p:stCondLst><p:cond delay="${delay}"/></p:stCondLst><p:childTnLst>`
        + `<p:set><p:cBhvr><p:cTn id="${b}" dur="1" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst></p:cTn>`
        + `<p:tgtEl><p:spTgt spid="${spid}"/></p:tgtEl><p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst>`
        + `</p:cBhvr><p:to><p:strVal val="visible"/></p:to></p:set>`
        + `<p:animEffect transition="in" filter="fade"><p:cBhvr><p:cTn id="${c}" dur="${DUR}"/>`
        + `<p:tgtEl><p:spTgt spid="${spid}"/></p:tgtEl></p:cBhvr></p:animEffect>`
        + `</p:childTnLst></p:cTn></p:par>`;
    }).join('');
  }).join('');

  return '<p:timing><p:tnLst><p:par><p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst>'
    + '<p:seq concurrent="1" nextAc="seek"><p:cTn id="2" dur="indefinite" nodeType="mainSeq"><p:childTnLst>'
    + '<p:par><p:cTn id="3" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst>'
    + '<p:par><p:cTn id="4" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst>'
    + effects
    + '</p:childTnLst></p:cTn></p:par>'
    + '</p:childTnLst></p:cTn></p:par>'
    + '</p:childTnLst></p:cTn>'
    + '<p:prevCondLst><p:cond evt="onPrev" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:prevCondLst>'
    + '<p:nextCondLst><p:cond evt="onNext" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:nextCondLst>'
    + '</p:seq></p:childTnLst></p:cTn></p:par></p:tnLst></p:timing>';
}

async function main() {
  const zip = await JSZip.loadAsync(fs.readFileSync(FILE));
  const report = [];
  for (let i = 0; i < slides.length; i++) {
    const name = `ppt/slides/slide${i + 1}.xml`;
    if (!zip.file(name)) throw new Error('thiếu ' + name);
    const groups = groupsOf(slides[i].els);
    let xml = await zip.file(name).async('string');
    xml = xml.replace(/<p:timing>[\s\S]*?<\/p:timing>/g, ''); // bỏ hiệu ứng cũ
    if (!xml.includes('</p:sld>')) throw new Error('cấu trúc lạ: ' + name);
    xml = xml.replace('</p:sld>', timingXml(groups) + '</p:sld>');
    zip.file(name, xml);
    const animated = groups.reduce((n, g) => n + g.length, 0);
    report.push({ slide: i + 1, khoi: groups.length, hinh: animated, coDinh: slides[i].els.length - animated });
  }
  fs.writeFileSync(FILE, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
  console.table(report);
  console.log('đã thêm hiệu ứng xuất hiện dần cho', slides.length, 'slide.');
}

module.exports = { groupsOf, isStatic };
if (require.main === module) main();
