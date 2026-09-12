const { SW, SH, M, C, widthOf, wrap, img, rect, txt, textH } = require('./core');

const TOTAL = 23;
const BG = 'bg-content.jpg';

// ---------- shared chrome ----------
function chrome(eyebrow, title, opts = {}) {
  const n = slides.length + 1;
  const els = [
    img(BG, 0, 0, SW, SH),
    rect(0, 0, SW, SH, C.ink, 0.34),
    img('mark-sm.png', M, 0.4, 0.34, 0.34),
    txt({ x: M + 0.5, y: 0.44, w: 4, text: 'ỨNG PHÓ NHANH', size: 11, weight: 'eb', color: C.greenSoft, spacing: 1.6 }),
    txt({ x: SW - M - 3, y: 0.44, w: 3, text: `${String(n).padStart(2, '0')} / ${TOTAL}`, size: 11, weight: 'sb', color: C.dim, align: 'right' }),
    rect(M, 0.95, SW - 2 * M, 0.012, C.white, 0.16),
    txt({ x: M, y: 1.26, w: 9, text: eyebrow, size: 11.5, weight: 'eb', color: C.green, spacing: 2.2 }),
    txt({ x: M, y: 1.58, w: SW - 2 * M - 0.4, text: title, size: 31, weight: 'eb', color: C.white, lh: 1.18 }),
    rect(M, SH - 0.64, SW - 2 * M, 0.01, C.white, 0.1),
    txt({ x: SW - M - 3, y: SH - 0.5, w: 3, text: 'ungphonhanh.life', size: 9.5, weight: 'm', color: C.dim, align: 'right' }),
  ];
  let bodyTop = 1.58 + textH(title, 31, 'eb', SW - 2 * M - 0.4, 1.18) + 0.34;
  if (opts.sub) {
    const s = txt({ x: M, y: bodyTop, w: opts.subW || 10.2, text: opts.sub, size: 14, weight: 'm', color: C.muted, lh: 1.4 });
    els.push(s);
    bodyTop = s.y + s.h + 0.4;
  }
  return { els, bodyTop };
}

// card with a coloured top accent
function card(x, y, w, h, accent) {
  const out = [rect(x, y, w, h, C.card, 0.66, 0.12, { color: C.white, alpha: 0.12, w: 1 })];
  if (accent) out.push(rect(x, y, 0.055, h, accent, 0.95, 0.03));
  return out;
}

function pill(x, y, text, color) {
  const size = 11.5, padX = 0.22, h = 0.36;
  const w = widthOf(text, size, 'sb') + padX * 2;
  return {
    w,
    els: [
      rect(x, y, w, h, color, 0.18, h / 2, { color, alpha: 0.55, w: 1 }),
      txt({ x, y: y + 0.085, w, text, size, weight: 'sb', color, align: 'center' }),
    ],
  };
}

function numberBadge(x, y, d, n, color) {
  return [
    rect(x, y, d, d, C.ink, 0.88, d / 2),
    rect(x, y, d, d, color, 0.2, d / 2, { color, alpha: 0.7, w: 1.2 }),
    txt({ x, y: y + d / 2 - 0.13, w: d, text: n, size: 15, weight: 'eb', color, align: 'center' }),
  ];
}
const slides = [];
// ---------- quy trình 6 bước: timeline dựng dần qua nhiều slide ----------
const STEPS = [
  ['Ghi nhận tình huống', 'Trưởng thôn báo cáo và ghim điểm gặp nạn lên bản đồ.'],
  ['AI phân tích và con người điều phối', 'AI đọc mô tả bằng lời thành số liệu và đề xuất vật tư, người điều phối sẽ chốt phương án.'],
  ['Chọn kho tiếp tế gần điểm gặp nạn nhất', 'Hệ thống cân nhắc vị trí, tồn kho và khả năng đáp ứng của từng kho.'],
  ['Xác nhận & thông báo', 'Kho nhận lệnh chuẩn bị, xuất vật tư; đội cứu hộ nhận nhiệm vụ cùng lúc.'],
  ['Đội cứu hộ xác nhận hoàn thành', 'Báo cáo kết quả nhiệm vụ kèm hình ảnh tại hiện trường.'],
  ['Kho xác nhận hoàn trả vật tư', 'Đối chiếu vật tư đã cấp phát và phần thu hồi, khép lại nhiệm vụ.'],
];

const DIM = { accent: '#3C5468', title: '#8096AB', body: '#5F7488' };
const GHOST = { accent: '#24323F', num: '#35485A' };

// hot = null: slide tổng quan, cả 6 bước hiển thị bình thường
// hot = [n...]: các bước được làm nổi bật, những bước còn lại mờ đi
function timelineSlide(hot, eyebrowNote, title, notes) {
  const { els, bodyTop } = chrome(`QUY TRÌNH ĐIỀU PHỐI CỨU HỘ  ·  ${eyebrowNote}`, title);
  const gap = 0.34, rowGap = 0.44;
  const w = (SW - 2 * M - 2 * gap) / 3, h = 1.9;
  const colX = (c) => M + c * (w + gap);
  const rowY = (r) => bodyTop + r * (h + rowGap);
  // xếp rắn bò: 1-2-3 ở hàng trên, 6-5-4 ở hàng dưới để bước 4 nằm ngay dưới bước 3
  const pos = (i) => (i < 3 ? { c: i, r: 0 } : { c: 5 - i, r: 1 });
  const FLOW = '#2E7D55';

  // hàng trên chảy sang phải, hàng dưới chảy ngược sang trái
  for (const c of [0, 1]) {
    els.push({ t: 'tri', x: colX(c) + w + gap / 2 - 0.09, y: rowY(0) + h / 2 - 0.12, w: 0.19, h: 0.24, fill: C.green, alpha: 0.75 });
    els.push({ t: 'tri', x: colX(c) + w + gap / 2 - 0.1, y: rowY(1) + h / 2 - 0.12, w: 0.19, h: 0.24, dir: 'left', fill: C.green, alpha: 0.75 });
  }
  // bước 3 xuống thẳng bước 4
  const xDown = colX(2) + w / 2;
  els.push(rect(xDown - 0.011, rowY(0) + h, 0.022, rowGap - 0.17, FLOW, 0.85));
  els.push({ t: 'tri', x: xDown - 0.1, y: rowY(1) - 0.18, w: 0.2, h: 0.17, dir: 'down', fill: C.green, alpha: 0.75 });

  STEPS.forEach(([head, body], i) => {
    const { c, r } = pos(i);
    const x = colX(c), y = rowY(r);
    const live = hot === null || hot.includes(i + 1);
    const glow = hot !== null && live;
    const accent = live ? C.green : DIM.accent;

    if (glow) els.push(rect(x - 0.06, y - 0.06, w + 0.12, h + 0.12, C.green, 0.18, 0.16));
    els.push(rect(x, y, w, h, C.card, live ? 0.78 : 0.55, 0.12,
      { color: glow ? C.green : C.white, alpha: glow ? 0.5 : live ? 0.16 : 0.1, w: glow ? 1.5 : 1 }));
    els.push(rect(x, y, 0.055, h, accent, 0.95, 0.03));
    els.push(...numberBadge(x + 0.3, y + 0.24, 0.46, String(i + 1), accent));
    els.push(txt({ x: x + 0.9, y: y + 0.31, w: w - 1.18, text: head, size: 14, weight: 'b',
      color: live ? C.white : DIM.title, lh: 1.25 }));
    els.push(txt({ x: x + 0.3, y: y + 0.98, w: w - 0.6, text: body, size: 11.5, weight: 'r',
      color: live ? C.text : DIM.body, lh: 1.42 }));
  });

  slides.push({ els, notes });
}

// ============ 1. TITLE ============
{
  const els = [
    img('bg-title.jpg', 0, 0, SW, SH),
    img('scrim-left.png', 0, 0, SW, SH),
    img('scrim-bottom.png', 0, 0, SW, SH),
    rect(0, 0, SW, SH, C.ink, 0.22),
    rect(M, 0.66, 1.86, 1.24, C.white, 0.96, 0.14),
    img('logo-sm.png', M + 0.17, 0.85, 1.52, 0.9),
    txt({ x: M, y: 2.82, w: 9, text: 'ỨNG PHÓ NHANH', size: 62, weight: 'eb', color: C.white, lh: 1.08 }),
    rect(M, 4.12, 1.45, 0.075, C.green, 1, 0.037),
    txt({ x: M, y: 4.42, w: 7.6, text: 'Giải pháp cứu hộ, cứu nạn và hậu cần thông minh', size: 21, weight: 'm', color: '#E8F1FA', lh: 1.3 }),
  ];
  let px = M;
  for (const [t, col] of [['Kết nối thông tin', C.greenSoft], ['Hỗ trợ ra quyết định', C.amber], ['Điều phối nguồn lực', C.sky]]) {
    const p = pill(px, 5.28, t, col);
    els.push(...p.els); px += p.w + 0.18;
  }
  els.push(txt({ x: M, y: 6.5, w: 8, text: 'Nhóm phát triển Ứng Phó Nhanh  ·  Lũ Trẻ', size: 11.5, weight: 'm', color: C.muted }));
  slides.push({ els, notes: 'Kính chào quý Ban Lãnh đạo, Ban Tổ chức và Ban Giám khảo. Nhóm chúng em xin trình bày dự án Ứng Phó Nhanh - Giải pháp cứu hộ, cứu nạn và hậu cần thông minh.' });
}
// ============ 2. BỐI CẢNH ============
{
  const { els, bodyTop } = chrome('BỐI CẢNH', 'Chúng em lớn lên cùng những mùa bão lũ');
  const y = bodyTop;
  const items = [
    ['🌊', 'Điều chúng em tận mắt chứng kiến', 'Nhà dân bị ngập, tuyến đường bị chia cắt, nhiều khu vực bị cô lập hoàn toàn.', C.sky],
    ['🚨', 'Những người ở tuyến đầu', 'Lực lượng cứu hộ làm việc liên tục ngày đêm để đưa người dân đến nơi an toàn.', C.orange],
    ['🛡️', 'Trải nghiệm thực chiến', 'Thành viên nhóm là chiến sĩ Công an nhân dân, trực tiếp tham gia cứu hộ trong đợt bão lũ lịch sử 2025.', C.green],
  ];
  const w = (SW - 2 * M - 2 * 0.3) / 3, h = 2.45;
  items.forEach(([ic, head, body, col], i) => {
    const x = M + i * (w + 0.3);
    els.push(...card(x, y, w, h, col));
    els.push(txt({ x: x + 0.34, y: y + 0.3, w: w - 0.6, text: head, size: 15, weight: 'b', color: C.white, lh: 1.25 }));
    els.push(txt({ x: x + 0.34, y: y + 1.12, w: w - 0.6, text: body, size: 12.5, weight: 'r', color: C.text, lh: 1.45 }));
  });
  const qy = y + h + 0.45;
  els.push(rect(M, qy, SW - 2 * M, 1.2, C.green, 0.12, 0.12, { color: C.green, alpha: 0.45, w: 1 }));
  els.push(rect(M, qy, 0.06, 1.2, C.green, 1, 0.03));
  els.push(txt({ x: M + 0.42, y: qy + 0.3, w: SW - 2 * M - 0.8, text: 'Chúng em trăn trở: liệu công nghệ và AI có thể giảm bớt gánh nặng cho những người đang trực tiếp điều phối cứu hộ? Đó là lý do Ứng Phó Nhanh ra đời.', size: 17, weight: 'sb', color: C.white, lh: 1.4 }));
  slides.push({ els, notes: 'Chúng em sinh ra và lớn lên tại vùng đất năm nào cũng chịu ảnh hưởng của bão lũ. Trong nhóm có thành viên là chiến sĩ Công an nhân dân, đã trực tiếp tham gia cứu hộ trong đợt bão lũ lịch sử năm 2025.' });
}
// ============ 3. VẤN ĐỀ ============
{
  const { els, bodyTop } = chrome('VẤN ĐỀ', 'Bài toán trong những giờ khẩn cấp');
  const y = bodyTop, lw = 4.45;
  els.push(...card(M, y, lw, 4.0, C.orange));
  els.push(txt({ x: M + 0.36, y: y + 0.36, w: lw - 0.72, text: 'Phía sau mỗi nhiệm vụ cứu hộ không chỉ là lòng dũng cảm', size: 17, weight: 'b', color: C.white, lh: 1.32 }));
  els.push(txt({ x: M + 0.36, y: y + 1.45, w: lw - 0.72, text: 'Đó còn là bài toán về thời gian, con người, vật tư và khả năng điều phối.', size: 13, weight: 'r', color: C.text, lh: 1.5 }));
  els.push(rect(M + 0.36, y + 2.45, lw - 0.72, 0.01, C.white, 0.16));
  els.push(txt({ x: M + 0.36, y: y + 2.72, w: lw - 0.72, text: 'Sau nhiều giờ, thậm chí nhiều ngày liên tục, con người sẽ xuống sức — trong khi quyết định vẫn phải đưa ra trong vài phút.', size: 13, weight: 'sb', color: C.amber, lh: 1.45 }));

  const rx = M + lw + 0.34, rw = SW - M - rx, cw = (rw - 0.3) / 2, ch = 1.85;
  const qs = [
    ['Cần những vật tư gì?', 'Chủng loại, số lượng phù hợp với quy mô ảnh hưởng.'],
    ['Lấy vật tư ở đâu?', 'Kho nào gần hiện trường nhất để rút ngắn thời gian.'],
    ['Kho nào còn đủ?', 'Tồn kho thực tế thay đổi liên tục trong thiên tai.'],
    ['Làm sao để mọi bộ phận nắm thông tin tức thời?', 'Thông tin phải đến đúng người, nhanh và chính xác.'],
  ];
  qs.forEach(([q, a], i) => {
    const x = rx + (i % 2) * (cw + 0.3), cy = y + Math.floor(i / 2) * (ch + 0.3);
    els.push(...card(x, cy, cw, ch, C.red));
    els.push(txt({ x: x + 0.3, y: cy + 0.28, w: cw - 0.6, text: q, size: 14.5, weight: 'b', color: C.white, lh: 1.25 }));
    els.push(txt({ x: x + 0.3, y: cy + 0.95, w: cw - 0.6, text: a, size: 11.5, weight: 'r', color: C.muted, lh: 1.4 }));
  });
  slides.push({ els, notes: 'Các quyết định vẫn phải đưa ra nhanh chóng: Cần vật tư gì? Lấy ở đâu? Kho nào còn đủ? Và làm sao để tất cả các bộ phận cùng nhận được thông tin nhanh chóng, chính xác?' });
}
// ============ 4. GIẢI PHÁP ============
{
  const { els, bodyTop } = chrome('GIẢI PHÁP', 'Một hệ thống — bốn mắt xích — một luồng thông tin', {
    sub: 'Kết nối xuyên suốt các bộ phận, đồng thời ứng dụng AI để phân tích và hỗ trợ ra quyết định trong thời điểm khẩn cấp.',
    subW: 11.2,
  });
  const top = bodyTop, band = 3.62;
  const w1 = 3.0, w2 = 3.2, w3 = 4.4, g1 = 0.55, g2 = 0.62;
  const x1 = M, x2 = x1 + w1 + g1, x3 = x2 + w2 + g2;
  const FLOW = '#2E7D55';

  // hai mắt xích đầu nằm giữa chiều cao, nhánh rẽ đôi ở bên phải
  const hL = 2.4, yL = top + (band - hL) / 2, cyL = yL + hL / 2;
  const hR = (band - 0.3) / 2, yA = top, yB = top + hR + 0.3;
  const cyA = yA + hR / 2, cyB = yB + hR / 2;

  const single = (x, w, y, h, num, head, body, col) => {
    els.push(...card(x, y, w, h, col));
    els.push(...numberBadge(x + 0.3, y + 0.3, 0.5, num, col));
    els.push(txt({ x: x + 0.3, y: y + 1.0, w: w - 0.6, text: head, size: 16, weight: 'eb', color: C.white }));
    els.push(txt({ x: x + 0.3, y: y + 1.42, w: w - 0.6, text: body, size: 12, weight: 'r', color: C.text, lh: 1.45 }));
  };
  const wide = (x, w, y, h, num, head, body, col) => {
    els.push(...card(x, y, w, h, col));
    els.push(...numberBadge(x + 0.3, y + 0.26, 0.46, num, col));
    els.push(txt({ x: x + 0.9, y: y + 0.33, w: w - 1.2, text: head, size: 16, weight: 'eb', color: C.white }));
    els.push(txt({ x: x + 0.3, y: y + 0.92, w: w - 0.6, text: body, size: 12, weight: 'r', color: C.text, lh: 1.45 }));
  };

  single(x1, w1, yL, hL, '01', 'Trưởng thôn', 'Báo cáo tình huống và định vị vị trí gặp nạn trên bản đồ.', C.sky);
  single(x2, w2, yL, hL, '02', 'Người điều phối', 'Dùng AI phân tích tình hình, phê duyệt phương án và lập kế hoạch cứu hộ.', C.green);
  wide(x3, w3, yA, hR, '03', 'Bộ phận kho', 'Nhận thông báo tức thì để chuẩn bị và xuất vật tư theo lệnh.', C.amber);
  wide(x3, w3, yB, hR, '04', 'Đội cứu hộ', 'Nhận nhiệm vụ, danh sách vật tư và vị trí kho trên bản đồ.', C.orange);

  // 01 → 02
  els.push({ t: 'tri', x: x1 + w1 + g1 / 2 - 0.1, y: cyL - 0.13, w: 0.2, h: 0.26, fill: C.green, alpha: 0.8 });
  // 02 rẽ đôi sang 03 và 04 cùng lúc
  const xs = x2 + w2 + 0.06, xb = x2 + w2 + 0.3, xe = x3 - 0.24;
  els.push(rect(xs, cyL - 0.011, xb - xs, 0.022, FLOW, 0.85));
  els.push(rect(xb - 0.011, cyA, 0.022, cyB - cyA, FLOW, 0.85));
  for (const cy of [cyA, cyB]) {
    els.push(rect(xb, cy - 0.011, xe - xb, 0.022, FLOW, 0.85));
    els.push({ t: 'tri', x: xe, y: cy - 0.13, w: 0.2, h: 0.26, fill: C.green, alpha: 0.8 });
  }

  slides.push({ els, notes: 'Trưởng thôn báo tình huống, người điều phối dùng AI lập phương án. Ngay khi phương án được duyệt, bộ phận kho và đội cứu hộ nhận thông tin cùng một lúc chứ không truyền tin nối tiếp qua nhau.' });
}

// ============ TIMELINE: tổng quan 6 bước ============
timelineSlide(null, 'TOÀN BỘ 6 BƯỚC', 'Nhiệm vụ được theo dõi minh bạch từ đầu đến cuối',
  'Giới thiệu sơ bộ toàn bộ quy trình: từ tin báo của trưởng thôn, AI phân tích, chọn kho, xác nhận và thông báo, đội cứu hộ báo cáo hoàn thành, cuối cùng là kho xác nhận hoàn trả vật tư. Sau đây nhóm em xin đi sâu từng bước.');

// ============ TIMELINE: nhấn mạnh bước 1-2 ============
timelineSlide([1, 2], 'BƯỚC 1 → 2 / 6', 'Ghi nhận đúng chỗ, phân tích đúng nhu cầu',
  'Quy trình bắt đầu từ tin báo của trưởng thôn, sau đó AI phân tích tình hình để người điều phối chốt phương án.');
// ============ 6. AI THAM MƯU ============
{
  const { els, bodyTop } = chrome('AI THAM MƯU', 'Kể bằng lời — AI lập bản tham mưu');
  const y = bodyTop, lw = 5.1, h = 4.16;
  els.push(...card(M, y, lw, h, C.sky));
  els.push(txt({ x: M + 0.34, y: y + 0.3, w: lw - 0.68, text: 'NGƯỜI ĐIỀU PHỐI NHẬP', size: 10.5, weight: 'eb', color: C.sky, spacing: 1.8 }));
  els.push(rect(M + 0.34, y + 0.75, lw - 0.68, 1.5, C.white, 0.08, 0.1, { color: C.white, alpha: 0.18, w: 1 }));
  els.push(txt({ x: M + 0.56, y: y + 0.98, w: lw - 1.12, text: '“Lũ quét xã Đồng Xuân, khoảng 200 người mắc kẹt, có 10 cháu nhỏ, 3 ngày chưa có nước sạch.”', size: 14, weight: 'm', color: C.white, lh: 1.45 }));
  els.push(txt({ x: M + 0.34, y: y + 2.62, w: lw - 0.68, text: 'Gõ hoặc bấm “Nói để nhập” — không phải điền form trong lúc khẩn cấp.', size: 12, weight: 'r', color: C.muted, lh: 1.45 }));
  const p = pill(M + 0.34, y + 3.36, 'Phân tích bằng AI', C.greenSoft);
  els.push(...p.els);

  els.push({ t: 'tri', x: M + lw + 0.25, y: y + h / 2 - 0.15, w: 0.24, h: 0.3, fill: C.greenSoft, alpha: 0.9 });

  const rx = M + lw + 0.74, rw = SW - M - rx, rh = 0.95, gap = 0.12;
  const outs = [
    ['Số liệu ngay lập tức điền sẵn để người điều phối kiểm tra', 'Loại tình huống, số người, số giờ cô lập, trẻ em, người già, ca y tế.', C.green],
    ['Danh mục vật tư đề xuất', 'Vật tư, thiết bị và nguồn lực cần thiết cho nhiệm vụ.', C.amber],
    ['Kho xuất hàng tối ưu', 'Dựa trên vị trí, tồn kho và khả năng đáp ứng của từng kho.', C.sky],
    ['Bản tham mưu sẵn sàng duyệt', 'Người điều phối chỉ cần kiểm tra, chỉnh sửa và xác nhận phương án.', C.orange],
  ];
  outs.forEach(([head, body, col], i) => {
    const cy = y + i * (rh + gap);
    els.push(...card(rx, cy, rw, rh, col));
    els.push(txt({ x: rx + 0.3, y: cy + 0.2, w: rw - 0.6, text: head, size: 13.5, weight: 'b', color: C.white }));
    els.push(txt({ x: rx + 0.3, y: cy + 0.52, w: rw - 0.6, text: body, size: 11.5, weight: 'r', color: C.muted, lh: 1.3 }));
  });
  slides.push({ els, notes: 'AI đọc mô tả bằng lời thành số liệu, đề xuất vật tư và chọn kho tối ưu để rút ngắn thời gian ứng cứu.' });
}

// ============ TIMELINE: thêm bước 3 ============
timelineSlide([3], 'BƯỚC 3 / 6', 'Chọn kho theo khoảng cách và khả năng đáp ứng',
  'Sau khi có danh mục vật tư, hệ thống chọn kho tiếp tế gần điểm gặp nạn nhất.');
// ============ CHỌN KHO TIẾP TẾ (đi sâu bước 3) ============
{
  const { els, bodyTop } = chrome('BƯỚC 3  ·  CHỌN KHO TIẾP TẾ', 'Kho nào gần nhất? Không đủ thì lấy tiếp ở đâu?');
  const y = bodyTop, lw = 5.55, h = 4.3;

  els.push(...card(M, y, lw, h, C.sky));
  els.push(txt({ x: M + 0.32, y: y + 0.28, w: lw - 0.64, text: 'VÍ DỤ: NHIỆM VỤ CẦN 100 ÁO PHAO', size: 10.5, weight: 'eb', color: C.sky, spacing: 1.6 }));
  const rows = [
    ['Kho thôn Long Bình', '1,2 km  ·  còn 40 áo phao', 'lấy 40', C.green],
    ['Kho thôn Long Mỹ', '1,6 km  ·  còn 35 áo phao', 'lấy 35', C.green],
    ['Kho thôn Long Thạnh', '2,0 km  ·  còn 60 áo phao', 'lấy 25', C.green],
  ];
  rows.forEach(([name, meta, take, col], i) => {
    const ry = y + 0.82 + i * 0.95;
    els.push(rect(M + 0.32, ry, lw - 0.64, 0.82, C.white, 0.06, 0.1, { color: col, alpha: 0.3, w: 1 }));
    els.push(txt({ x: M + 0.5, y: ry + 0.14, w: lw - 2.3, text: name, size: 13.5, weight: 'b', color: C.white }));
    els.push(txt({ x: M + 0.5, y: ry + 0.46, w: lw - 2.3, text: meta, size: 11.5, weight: 'r', color: C.muted }));
    els.push(txt({ x: M + lw - 1.75, y: ry + 0.26, w: 1.4, text: take, size: 15, weight: 'eb', color: col, align: 'right' }));
  });
  els.push(rect(M + 0.32, y + 3.82, lw - 0.64, 0.01, C.white, 0.14));
  els.push(txt({ x: M + 0.32, y: y + 3.96, w: lw - 0.64, text: 'Đủ 100 áo phao từ 3 kho, gần trước — xa sau.', size: 12.5, weight: 'sb', color: C.greenSoft }));

  const rx = M + lw + 0.38, rw = SW - M - rx, rh = 0.78, gap = 0.105;
  const rules = [
    ['Đường đi thực tế, không phải đường chim bay', 'Hệ thống định tuyến theo đường sá thật, không đo đường thẳng.', C.green],
    ['Gần trước, hạn dùng gần hết trước', 'Cùng khoảng cách thì ưu tiên lô sắp hết hạn, tránh lãng phí.', C.amber],
    ['Thiếu thì tràn sang kho kế tiếp', 'Lấy hết phần kho gần có, phần thiếu chuyển sang kho gần kế tiếp.', C.sky],
    ['Tự loại kho không thể xuất', 'Kho đang có sự cố, vật tư hỏng hoặc hết hạn đều bị loại.', C.orange],
    ['Cả xã vẫn không đủ?', 'Hệ thống gợi ý kho của xã lân cận để người điều phối liên hệ.', C.red],
  ];
  rules.forEach(([head, body, col], i) => {
    const cy = y + i * (rh + gap);
    els.push(...card(rx, cy, rw, rh, col));
    els.push(txt({ x: rx + 0.3, y: cy + 0.13, w: rw - 0.6, text: head, size: 13, weight: 'b', color: C.white }));
    els.push(txt({ x: rx + 0.3, y: cy + 0.42, w: rw - 0.6, text: body, size: 11.5, weight: 'r', color: C.muted, lh: 1.3 }));
  });

  slides.push({ els, notes: 'Hệ thống tính quãng đường thực tế từ điểm gặp nạn tới từng kho, ưu tiên kho gần nhất. Kho gần nhất không đủ thì lấy hết phần đang có rồi tràn sang kho gần thứ hai, thứ ba. Kho đang có sự cố hoặc vật tư hỏng, hết hạn sẽ bị loại khỏi phương án.' });
}

// ============ TIMELINE: thêm bước 4 ============
timelineSlide([4], 'BƯỚC 4 / 6', 'Phương án được duyệt, thông tin đầy đủ',
  'Người điều phối xác nhận phương án, kho và đội cứu hộ nhận thông báo cùng lúc.');
// ============ XÁC NHẬN & THÔNG BÁO (đi sâu bước 4) ============
{
  const { els, bodyTop } = chrome('BƯỚC 4  ·  XÁC NHẬN & THÔNG BÁO', 'Xác nhận một lần, hai bộ phận cùng nhận thông tin');
  const y = bodyTop, gap = 0.36, w = (SW - 2 * M - gap) / 2, h = 3.45;
  const cols = [
    ['BỘ PHẬN KHO', 'Chuẩn bị và xuất vật tư', C.amber, [
      'Nhận thông báo ngay khi người điều phối xác nhận phương án.',
      'Nhận thông tin xong là soạn vật tư theo danh sách và xuất kho, tồn kho trừ ngay lúc xuất.',
    ]],
    ['ĐỘI CỨU HỘ', 'Biết đi đâu, nhận gì, ở kho nào', C.sky, [
      'Điểm gặp nạn hiển thị trực tiếp trên bản đồ.',
      'Danh sách vật tư cần nhận cho nhiệm vụ của mình.',
      'Danh sách kho cần đến kèm vị trí từng kho trên bản đồ.',
      'Đường đi từ các kho đến điểm gặp nạn',
    ]],
  ];
  cols.forEach(([label, sub, col, items], i) => {
    const x = M + i * (w + gap);
    els.push(...card(x, y, w, h, col));
    els.push(txt({ x: x + 0.36, y: y + 0.3, w: w - 0.72, text: label, size: 10.5, weight: 'eb', color: col, spacing: 1.8 }));
    els.push(txt({ x: x + 0.36, y: y + 0.6, w: w - 0.72, text: sub, size: 17, weight: 'eb', color: C.white }));
    els.push(rect(x + 0.36, y + 1.12, w - 0.72, 0.01, C.white, 0.14));
    let cy = y + 1.34;
    for (const it of items) {
      els.push(rect(x + 0.38, cy + 0.08, 0.09, 0.09, col, 0.95, 0.045));
      const t = txt({ x: x + 0.64, y: cy, w: w - 1.0, text: it, size: 12.5, weight: 'r', color: C.text, lh: 1.4 });
      els.push(t);
      cy += t.h + 0.16;
    }
  });
  const by = y + h + 0.28;
  els.push(rect(M, by, SW - 2 * M, 0.62, C.green, 0.12, 0.1, { color: C.green, alpha: 0.4, w: 1 }));
  els.push(txt({ x: M + 0.36, y: by + 0.17, w: SW - 2 * M - 0.72, text: 'Không ai phải gọi điện hỏi lại: kho biết chuẩn bị gì, đội cứu hộ biết đi đâu và nhận ở đâu.', size: 13, weight: 'sb', color: C.white }));

  slides.push({ els, notes: 'Khi người điều phối xác nhận, kho và đội cứu hộ nhận thông tin cùng một lúc. Kho có phiếu yêu cầu riêng để chuẩn bị và xuất vật tư; đội cứu hộ thấy điểm gặp nạn trên bản đồ, biết cần nhận vật tư gì và phải tới những kho nào.' });
}

// ============ TIMELINE: thêm bước 5 ============
timelineSlide([5], 'BƯỚC 5 / 6', 'Hoàn thành nhiệm vụ và gửi bằng chứng',
  'Hoàn thành nhiệm vụ, đội cứu hộ xác nhận trên hệ thống và gửi kèm hình ảnh tại hiện trường.');

// ============ TIMELINE: thêm bước 6, khép vòng ============
timelineSlide([6], 'BƯỚC 6 / 6  ·  KHÉP VÒNG', 'Vật tư hoàn trả xong, nhiệm vụ khép lại',
  'Kho xác nhận phần vật tư đội cứu hộ hoàn trả. Toàn bộ vòng đời nhiệm vụ được ghi lại đầy đủ trong hệ thống.');
// ============ 7. DỮ LIỆU & DỰ BÁO ============
{
  const { els, bodyTop } = chrome('DỮ LIỆU & DỰ BÁO', 'Mỗi đợt thiên tai để lại dữ liệu cho đợt sau');
  const y = bodyTop, n = 4, gap = 0.3;
  const w = (SW - 2 * M - (n - 1) * gap) / n, h = 2.35;
  const cards = [
    ['✓', 'Nhiệm vụ đã hoàn thành', 'Bao nhiêu nhiệm vụ hoàn thành, bao nhiêu còn dang dở sau mỗi đợt.', C.green],
    ['📦', 'Vật tư đã sử dụng', 'Thống kê chính xác lượng vật tư đã cấp phát cho từng nhiệm vụ.', C.sky],
    ['⚠', 'Vật tư thất thoát', 'Ghi nhận phần thất thoát trong quá trình cứu hộ để rút kinh nghiệm.', C.red],
    ['🗂', 'Lưu trữ lâu dài', 'Tra cứu dữ liệu của nhiều năm trước chỉ trong vài giây.', C.amber],
  ];
  cards.forEach(([ic, head, body, col], i) => {
    const x = M + i * (w + gap);
    els.push(...card(x, y, w, h, col));
    els.push(txt({ x: x + 0.32, y: y + 0.3, w: w - 0.64, text: head, size: 15, weight: 'b', color: C.white, lh: 1.25 }));
    els.push(txt({ x: x + 0.32, y: y + 1.14, w: w - 0.64, text: body, size: 12, weight: 'r', color: C.text, lh: 1.45 }));
  });
  const by = y + h + 0.42;
  els.push(rect(M, by, SW - 2 * M, 1.15, C.green, 0.12, 0.12, { color: C.green, alpha: 0.45, w: 1 }));
  els.push(rect(M, by, 0.06, 1.15, C.green, 1, 0.03));
  els.push(txt({ x: M + 0.42, y: by + 0.24, w: SW - 2 * M - 0.84, text: 'Dựa trên dữ liệu thực tế của những năm trước, người quản lý lập kế hoạch dự trữ sát với nhu cầu hơn — chuẩn bị trước khi thiên tai đến, thay vì xoay xở khi đã xảy ra.', size: 14.5, weight: 'sb', color: C.white, lh: 1.45 }));
  slides.push({ els, notes: 'Hệ thống lưu lại toàn bộ dữ liệu từng đợt cứu hộ, trở thành nguồn thông tin để phân tích và dự báo nhu cầu vật tư cho những đợt tiếp theo.' });
}
// ============ K1. QUẢN LÝ KHO TẬP TRUNG ============
{
  const { els, bodyTop } = chrome('QUẢN LÝ KHO TẬP TRUNG', 'Không hỏi còn bao nhiêu — hỏi dùng được bao nhiêu');
  const y = bodyTop, lw = 4.5, rx = M + lw + 0.38, rw = SW - M - rx, h = 3.3;

  els.push(...card(M, y, lw, h, C.green));
  els.push(txt({ x: M + 0.34, y: y + 0.3, w: lw - 0.68, text: 'MỘT SỔ KHO DUY NHẤT', size: 10.5, weight: 'eb', color: C.green, spacing: 1.8 }));
  [['01', 'kho tổng'], ['17', 'kho thôn']].forEach(([n, lb], i) => {
    const sy = y + 0.72 + i * 0.94;
    els.push(rect(M + 0.34, sy, lw - 0.68, 0.84, C.white, 0.07, 0.1, { color: C.white, alpha: 0.14, w: 1 }));
    els.push(txt({ x: M + 0.54, y: sy + 0.14, w: 1.0, text: n, size: 26, weight: 'eb', color: C.greenSoft }));
    els.push(txt({ x: M + 1.48, y: sy + 0.29, w: lw - 1.9, text: lb, size: 14, weight: 'sb', color: C.text }));
  });
  els.push(txt({ x: M + 0.34, y: y + 2.66, w: lw - 0.68, text: 'Tồn kho, lịch sử nhập — xuất và thông tin từng kho nằm chung một hệ thống.', size: 12.5, weight: 'r', color: C.text, lh: 1.45 }));

  const cw = (rw - 0.3) / 2, ch = 2.62;
  [['TÌNH TRẠNG VẬT LÝ', ['Mới', 'Đã dùng', 'Cần kiểm tra', 'Hỏng'], C.sky],
   ['TRẠNG THÁI LƯU HÀNH', ['Đang trong kho', 'Đang cho mượn', 'Đã xuất'], C.amber]].forEach(([label, items, col], i) => {
    const x = rx + i * (cw + 0.3);
    els.push(...card(x, y, cw, ch, col));
    els.push(txt({ x: x + 0.32, y: y + 0.3, w: cw - 0.64, text: label, size: 10.5, weight: 'eb', color: col, spacing: 1.6 }));
    items.forEach((it, k) => {
      const iy = y + 0.78 + k * 0.46;
      els.push(rect(x + 0.32, iy + 0.08, 0.09, 0.09, col, 0.95, 0.045));
      els.push(txt({ x: x + 0.58, y: iy, w: cw - 0.9, text: it, size: 13, weight: 'sb', color: C.white }));
    });
  });
  els.push(txt({ x: rx, y: y + ch + 0.16, w: rw, text: 'Mỗi lô hàng mang hai chiều trạng thái tách rời nhau.', size: 11.5, weight: 'r', color: C.muted }));

  const by = y + h + 0.26;
  els.push(rect(M, by, SW - 2 * M, 0.78, C.red, 0.12, 0.1, { color: C.red, alpha: 0.42, w: 1 }));
  els.push(rect(M, by, 0.055, 0.78, C.red, 0.95, 0.03));
  els.push(txt({ x: M + 0.4, y: by + 0.22, w: SW - 2 * M - 0.8, text: 'Áo phao đang cho mượn  ≠  áo phao khả dụng — đây là chỗ phần mềm kho thông thường hay đếm nhầm.', size: 14.5, weight: 'eb', color: C.white }));

  slides.push({ els, notes: 'Một xã có một kho tổng và mười bảy kho thôn. Biết còn bao nhiêu là chưa đủ: ba mươi áo phao còn tốt nhưng đang cho đội xung kích mượn đi diễn tập thì không được tính là khả dụng.' });
}

// ============ K2. CHỈ SỐ SẴN SÀNG ============
{
  const { els, bodyTop } = chrome('CHỈ SỐ SẴN SÀNG CỦA KHO', 'Một kết luận vận hành, không phải một con số');
  const y = bodyTop, lw = 4.9, rx = M + lw + 0.38, rw = SW - M - rx, h = 4.3;

  els.push(...card(M, y, lw, h, C.green));
  els.push(txt({ x: M + 0.36, y: y + 0.32, w: lw - 0.72, text: 'CÁCH CHẤM ĐIỂM', size: 10.5, weight: 'eb', color: C.green, spacing: 1.8 }));
  [['6', 'chiều đánh giá'], ['4', 'cấp: lô → kệ → khu → toàn kho']].forEach(([n, lb], i) => {
    const sy = y + 0.76 + i * 1.0;
    els.push(rect(M + 0.36, sy, lw - 0.72, 0.86, C.white, 0.07, 0.1, { color: C.white, alpha: 0.14, w: 1 }));
    els.push(txt({ x: M + 0.56, y: sy + 0.16, w: 0.7, text: n, size: 24, weight: 'eb', color: C.greenSoft }));
    els.push(txt({ x: M + 1.26, y: sy + 0.3, w: lw - 1.7, text: lb, size: 12.5, weight: 'sb', color: C.text }));
  });
  els.push(txt({ x: M + 0.36, y: y + 3.0, w: lw - 0.72, text: 'Mỗi điểm bị trừ đều kèm lý do và việc phải làm, thay vì chỉ đưa ra một con số.', size: 13, weight: 'sb', color: C.greenSoft, lh: 1.45 }));

  const seq = [
    ['Kho trung tâm: 95 / 100 điểm', 'Nhìn con số thì rất đẹp.', C.green],
    ['Cảm biến khói vượt ngưỡng, nhiệt độ tăng vọt', 'Hệ thống mở sự cố nguy cơ cháy.', C.amber],
    ['KHÔNG ĐIỀU PHỐI ĐƯỢC', 'Người điều phối biết ngay: không được lên phương án lấy hàng từ kho này.', C.red],
  ];
  const sh = 1.18, sg = 0.28;
  seq.forEach(([head, body, col], i) => {
    const cy = y + i * (sh + sg);
    els.push(...card(rx, cy, rw, sh, col));
    els.push(txt({ x: rx + 0.32, y: cy + 0.22, w: rw - 0.64, text: head, size: 15, weight: 'eb', color: i === 2 ? col : C.white }));
    els.push(txt({ x: rx + 0.32, y: cy + 0.66, w: rw - 0.64, text: body, size: 12, weight: 'r', color: C.muted, lh: 1.35 }));
    if (i < 2) els.push({ t: 'tri', x: rx + rw / 2 - 0.11, y: cy + sh + 0.05, w: 0.22, h: 0.18, dir: 'down', fill: C.green, alpha: 0.8 });
  });

  slides.push({ els, notes: 'Chỉ số chấm theo sáu chiều, tính ở bốn cấp: lô, kệ, khu, toàn kho. Khi cảm biến báo nguy cơ cháy, kho đang chín mươi lăm điểm lập tức chuyển sang trạng thái không điều phối được.' });
}

// ============ K3. TỒN KHO TOÀN XÃ ============
{
  const { els, bodyTop } = chrome('TỒN KHO TOÀN XÃ', 'Thiếu ở kho tổng, có thể đang thừa ở thôn bên');
  const y = bodyTop, gap = 0.62, w = (SW - 2 * M - gap) / 2, h = 2.95;

  const big = (x, label, value, sub, col) => {
    els.push(...card(x, y, w, h, col));
    els.push(txt({ x: x + 0.36, y: y + 0.32, w: w - 0.72, text: label, size: 10.5, weight: 'eb', color: col, spacing: 1.8 }));
    els.push(txt({ x: x + 0.36, y: y + 0.86, w: w - 0.72, text: value, size: 27, weight: 'eb', color: C.white, lh: 1.2 }));
    els.push(txt({ x: x + 0.36, y: y + 2.1, w: w - 0.72, text: sub, size: 12.5, weight: 'r', color: C.muted, lh: 1.4 }));
  };
  big(M, 'KHO TỔNG', 'Gần hết bộ sơ cứu', 'Nhìn riêng con số ở đây rất dễ kết luận cả xã đã hết hàng.', C.red);
  big(M + w + gap, 'KHO THÔN LONG CHÂU', 'Hơn 1.600 bộ', 'Thứ đang cần vẫn còn nguyên, chỉ cách hiện trường vài ki-lô-mét.', C.green);
  els.push({ t: 'tri', x: M + w + gap / 2 - 0.11, y: y + h / 2 - 0.14, w: 0.22, h: 0.28, fill: C.greenSoft, alpha: 0.9 });

  const by = y + h + 0.32;
  els.push(rect(M, by, SW - 2 * M, 0.9, C.green, 0.12, 0.1, { color: C.green, alpha: 0.4, w: 1 }));
  els.push(rect(M, by, 0.055, 0.9, C.green, 0.95, 0.03));
  els.push(txt({ x: M + 0.4, y: by + 0.18, w: SW - 2 * M - 0.8, text: 'Màn hình tồn kho toàn xã gộp cả 18 kho vào một bảng: xe chạy 4 ki-lô-mét, thay vì gọi điện xin chi viện xã bên.', size: 14, weight: 'sb', color: C.white, lh: 1.4 }));

  slides.push({ els, notes: 'Hệ thống ngăn một sai lầm đã thấy ngoài đời: người trực nhìn con số ở kho tổng, kết luận cả xã hết hàng rồi đi xin chi viện, trong khi thứ mình cần đang nằm ở thôn bên cạnh. Nếu dư thời gian, nói thêm ở đây về dự báo nhu cầu theo lượng mưa 72 giờ và bản tin đầu ngày.' });
}

// ============ K4. IoT ============
{
  const { els, bodyTop } = chrome('CẢM BIẾN IoT TẠI KHO', 'Cảnh báo trước khi mất hàng');
  const y = bodyTop, tw = (SW - 2 * M - 0.3) / 2;
  [['9 loại thiết bị', 'Cân kệ, nhiệt độ, độ ẩm, khói, cảm biến cửa, cổng RFID, camera, nguồn điện…', C.sky],
   ['9 loại sự cố được quét tự động', 'Hệ thống mở hồ sơ sự cố kèm bằng chứng và báo theo thời gian thực.', C.green]].forEach(([hd, bd, col], i) => {
    const x = M + i * (tw + 0.3);
    els.push(...card(x, y, tw, 0.95, col));
    els.push(txt({ x: x + 0.32, y: y + 0.14, w: tw - 0.64, text: hd, size: 15, weight: 'eb', color: C.white }));
    els.push(txt({ x: x + 0.32, y: y + 0.52, w: tw - 0.64, text: bd, size: 11.5, weight: 'r', color: C.muted }));
  });

  const ry = y + 1.18, rh = 1.85;
  [['Nguy cơ cháy đòi hai dấu hiệu cùng lúc', 'Khói vượt 30 ppm VÀ nhiệt độ tăng từ 15 độ trở lên trong cùng một cửa sổ quét.\n\nMột hệ thống báo động giả vài lần sẽ bị người ta tắt đi.', C.orange],
   ['Sự im lặng cũng là một sự cố', 'Bỏ lỡ 3 chu kỳ báo thì cảnh báo; bỏ lỡ 10 chu kỳ thì coi như thiết bị đã chết.\n\nIm lặng rất dễ bị hiểu nhầm là “mọi thứ bình thường”.', C.amber]].forEach(([hd, bd, col], i) => {
    const x = M + i * (tw + 0.3);
    els.push(...card(x, ry, tw, rh, col));
    els.push(txt({ x: x + 0.32, y: ry + 0.22, w: tw - 0.64, text: hd, size: 15, weight: 'b', color: C.white }));
    els.push(txt({ x: x + 0.32, y: ry + 0.66, w: tw - 0.64, text: bd, size: 11.5, weight: 'r', color: C.text, lh: 1.42 }));
  });

  const by = ry + rh + 0.26;
  [['Thư cảnh báo ghi 3 mốc thời gian', 'Lúc phát hiện · lúc hệ thống nhận · lúc gửi đi — mất mạng thì nằm hàng chờ và gửi lại sau.', C.green],
   ['2 giờ sáng, độ ẩm lên 88% vì mái dột', 'Hệ thống mở sự cố bảo quản xấu và gửi thư ngay. Sáng ra, thuốc và lương khô vẫn dùng được.', C.sky]].forEach(([hd, bd, col], i) => {
    const x = M + i * (tw + 0.3);
    els.push(...card(x, by, tw, 1.0, col));
    els.push(txt({ x: x + 0.32, y: by + 0.16, w: tw - 0.64, text: hd, size: 13, weight: 'b', color: C.white }));
    els.push(txt({ x: x + 0.32, y: by + 0.5, w: tw - 0.64, text: bd, size: 11.5, weight: 'r', color: C.muted, lh: 1.3 }));
  });

  slides.push({ els, notes: 'Hai quy tắc này thể hiện rõ nhất cách nhóm em suy nghĩ: không để báo động giả làm người ta tắt hệ thống, và không coi sự im lặng của thiết bị là mọi thứ bình thường.' });
}

// ============ K5. NÓI THẲNG VỀ PHẦN CỨNG ============
{
  const { els, bodyTop } = chrome('NÓI THẲNG VỀ PHẦN CỨNG', 'Hôm nay: bản sao số. Ngày mai: cảm biến thật.');
  const y = bodyTop, gap = 0.3, w = (SW - 2 * M - 2 * gap) / 3, h = 3.1;
  [['Vì sao làm như vậy', 'Một ứng dụng mô phỏng đủ 9 loại thiết bị, để kiểm thử trọn chuỗi tín hiệu → sự cố → cảnh báo → chỉ số sẵn sàng trước khi bỏ tiền mua thiết bị.', C.sky],
   ['Chung một đường ống dữ liệu', 'Cảm biến thật và thiết bị mô phỏng đi chung một lối vào. Mỗi cổng thu phát có khóa riêng và chỉ gửi được cho đúng kho của mình.', C.green],
   ['Khi gắn thiết bị thật', 'Phần nghiệp vụ phía sau không phải sửa — chỉ thay nguồn phát tín hiệu, toàn bộ luồng sự cố và cảnh báo giữ nguyên.', C.amber]].forEach(([hd, bd, col], i) => {
    const x = M + i * (w + gap);
    els.push(...card(x, y, w, h, col));
    els.push(txt({ x: x + 0.34, y: y + 0.32, w: w - 0.68, text: hd, size: 16, weight: 'b', color: C.white, lh: 1.25 }));
    els.push(txt({ x: x + 0.34, y: y + 1.0, w: w - 0.68, text: bd, size: 12.5, weight: 'r', color: C.text, lh: 1.5 }));
  });
  const by = y + h + 0.3;
  els.push(rect(M, by, SW - 2 * M, 0.82, C.white, 0.08, 0.1, { color: C.white, alpha: 0.18, w: 1 }));
  els.push(rect(M, by, 0.055, 0.82, C.greenSoft, 0.95, 0.03));
  els.push(txt({ x: M + 0.4, y: by + 0.25, w: SW - 2 * M - 0.8, text: 'Không tuyên bố tương thích phần cứng trước khi nghiệm thu thiết bị thật.', size: 15, weight: 'eb', color: C.white }));

  slides.push({ els, notes: 'Đây là lựa chọn kỹ thuật, không phải thiếu sót. Nói bình thản, không hạ giọng.' });
}

// ============ K6. TRỢ LÝ AI ============
{
  const { els, bodyTop } = chrome('TRỢ LÝ AI', 'Hỏi bằng tiếng Việt. Nhưng không được bịa số.');
  const y = bodyTop, lw = 5.0, rx = M + lw + 0.38, rw = SW - M - rx, h = 3.2;

  els.push(...card(M, y, lw, h, C.sky));
  els.push(txt({ x: M + 0.34, y: y + 0.28, w: lw - 0.68, text: 'HỎI BẰNG NGÔN NGỮ TỰ NHIÊN', size: 10.5, weight: 'eb', color: C.sky, spacing: 1.7 }));
  const q = txt({ x: M + 0.5, y: y + 0.83, w: lw - 1.0, text: '“Kho nào còn nhiều áo phao nhất?”', size: 13, weight: 'sb', color: C.white, lh: 1.35 });
  els.push(rect(M + 0.34, y + 0.7, lw - 0.68, q.h + 0.26, C.sky, 0.14, 0.1, { color: C.sky, alpha: 0.4, w: 1 }));
  els.push(q);
  els.push(txt({ x: M + 0.34, y: y + 1.44, w: lw - 0.68, text: 'Khoảng 2 giây là có số, kèm phân bổ theo từng kho.', size: 12, weight: 'r', color: C.text }));
  els.push(rect(M + 0.34, y + 1.86, lw - 0.68, 0.01, C.white, 0.16));
  els.push(txt({ x: M + 0.34, y: y + 2.02, w: lw - 0.68, text: 'KHI CON SỐ KHÔNG KHỚP DỮ LIỆU', size: 10.5, weight: 'eb', color: C.red, spacing: 1.7 }));
  els.push(rect(M + 0.34, y + 2.42, lw - 0.68, 0.56, C.red, 0.16, 0.1, { color: C.red, alpha: 0.45, w: 1 }));
  els.push(txt({ x: M + 0.5, y: y + 2.57, w: lw - 1.0, text: '“Chưa thể tạo câu trả lời an toàn.”', size: 13, weight: 'sb', color: C.white }));

  const rh = 0.94, gap = 0.19;
  [['Đối chiếu từng con số', 'Câu trả lời được soi lại với dữ liệu kho tại thời điểm hỏi; lệch thì chặn, không hiển thị.', C.green],
   ['Bắt buộc trích nguồn', 'Định mức và quy trình sơ cứu dựa trên Sphere Standards, IFRC, WHO và cơ quan phòng chống thiên tai Việt Nam.', C.amber],
   ['Chạy tại chỗ', 'Mô hình chạy trên máy đặt tại xã: không gửi dữ liệu ra ngoài, 0 đồng mỗi lượt gọi.', C.sky]].forEach(([hd, bd, col], i) => {
    const yy = y + i * (rh + gap);
    els.push(...card(rx, yy, rw, rh, col));
    els.push(txt({ x: rx + 0.3, y: yy + 0.16, w: rw - 0.6, text: hd, size: 13.5, weight: 'b', color: C.white }));
    els.push(txt({ x: rx + 0.3, y: yy + 0.48, w: rw - 0.6, text: bd, size: 11.5, weight: 'r', color: C.muted, lh: 1.3 }));
  });

  const by = y + h + 0.28;
  els.push(rect(M, by, SW - 2 * M, 0.82, C.red, 0.12, 0.1, { color: C.red, alpha: 0.42, w: 1 }));
  els.push(rect(M, by, 0.055, 0.82, C.red, 0.95, 0.03));
  els.push(txt({ x: M + 0.4, y: by + 0.24, w: SW - 2 * M - 0.8, text: 'Một câu trả lời sai nghe rất thuyết phục còn nguy hiểm hơn là không có câu trả lời nào.', size: 15, weight: 'eb', color: C.white }));

  slides.push({ els, notes: 'Sau khi mô hình viết xong câu trả lời, hệ thống đối chiếu từng con số với ảnh chụp dữ liệu kho tại thời điểm hỏi. Không khớp thì chặn lại và hiện thông báo chưa thể tạo câu trả lời an toàn từ dữ liệu hiện có.' });
}

// ============ K7. THƯ QUAN TÂM ============
{
  const { els, bodyTop } = chrome('HỘI CHỮ THẬP ĐỎ XÃ ĐỒNG XUÂN', 'Sản phẩm này có một nơi để về');
  const y = bodyTop, lw = 5.5, rx = M + lw + 0.4, rw = SW - M - rx, h = 4.05;

  els.push(rect(M, y, lw, h, C.white, 0.05, 0.12, { color: C.greenSoft, alpha: 0.4, w: 1.4 }));
  els.push(txt({ x: M + 0.4, y: y + h / 2 - 0.42, w: lw - 0.8, text: 'ẢNH CHỤP THƯ QUAN TÂM', size: 12, weight: 'eb', color: C.greenSoft, spacing: 1.8, align: 'center' }));
  els.push(txt({ x: M + 0.4, y: y + h / 2 + 0.02, w: lw - 0.8, text: 'Chèn ảnh lá thư vào khung này trong PowerPoint', size: 11.5, weight: 'r', color: C.dim, align: 'center', lh: 1.4 }));

  const items = [
    ['01', 'Xác nhận thực trạng', 'Kho còn quản lý bằng sổ và Excel; bão lũ 2025 vật tư hết hạn, hư hỏng, số liệu lệch giữa các thôn.'],
    ['02', 'Xác nhận nhu cầu thật', 'Xã cần một hệ thống quản lý kho và điều phối vật tư như Ứng Phó Nhanh.'],
    ['03', 'Đồng ý cho khảo sát và thử nghiệm', 'Tạo điều kiện cho nhóm khảo sát quy trình thật và triển khai thử nghiệm tại xã sau cuộc thi.'],
  ];
  const ih = (h - 2 * 0.2) / 3;
  items.forEach(([num, hd, bd], i) => {
    const yy = y + i * (ih + 0.2);
    els.push(...card(rx, yy, rw, ih, C.green));
    els.push(...numberBadge(rx + 0.28, yy + 0.2, 0.44, num, C.green));
    els.push(txt({ x: rx + 0.86, y: yy + 0.26, w: rw - 1.16, text: hd, size: 14.5, weight: 'b', color: C.white }));
    els.push(txt({ x: rx + 0.28, y: yy + 0.74, w: rw - 0.56, text: bd, size: 11.5, weight: 'r', color: C.text, lh: 1.35 }));
  });

  slides.push({ els, notes: 'Dự án bắt đầu từ quê nhà của chúng em — xã Đồng Xuân. Đoạn này nói chậm nhất, nhìn thẳng xuống ban giám khảo. Nếu thư chưa ký kịp: đổi tiêu đề thành “Đưa sản phẩm về đúng nơi nó sinh ra”, bỏ khung ảnh và giữ ba gạch đầu dòng ở thì tương lai.' });
}

// ============ 9. GIÁ TRỊ ============
{
  const { els, bodyTop } = chrome('GIÁ TRỊ MANG LẠI', 'Không chỉ là phần mềm kho, cũng không chỉ là một công cụ AI');
  const y = bodyTop, n = 3, gap = 0.34;
  const w = (SW - 2 * M - (n - 1) * gap) / n, h = 2.4;
  const pil = [
    ['01', 'Kết nối thông tin', 'Mọi bộ phận nhìn cùng một bức tranh, cùng một thời điểm.', C.sky],
    ['02', 'Hỗ trợ ra quyết định', 'AI phân tích và tham mưu, con người giữ quyền quyết định cuối cùng.', C.green],
    ['03', 'Điều phối nguồn lực', 'Vật tư đi từ đúng kho, đến đúng nơi, trong thời gian ngắn nhất.', C.amber],
  ];
  pil.forEach(([num, head, body, col], i) => {
    const x = M + i * (w + gap);
    els.push(...card(x, y, w, h, col));
    els.push(txt({ x: x + 0.34, y: y + 0.3, w: w - 0.68, text: num, size: 26, weight: 'eb', color: col }));
    els.push(txt({ x: x + 0.34, y: y + 1.0, w: w - 0.68, text: head, size: 17, weight: 'eb', color: C.white }));
    els.push(txt({ x: x + 0.34, y: y + 1.48, w: w - 0.68, text: body, size: 12.5, weight: 'r', color: C.text, lh: 1.45 }));
  });
  const by = y + h + 0.38;
  els.push(rect(M, by, SW - 2 * M, 0.98, C.white, 0.07, 0.12, { color: C.white, alpha: 0.16, w: 1 }));
  els.push(txt({ x: M + 0.4, y: by + 0.26, w: SW - 2 * M - 0.8, text: 'Để công nghệ chia sẻ một phần áp lực với những con người đang trực tiếp đứng ở tuyến đầu.', size: 16, weight: 'sb', color: C.white, lh: 1.4 }));
  slides.push({ els, notes: 'Điều chúng em muốn xây dựng là một hệ thống kết nối thông tin, hỗ trợ ra quyết định và điều phối nguồn lực.' });
}
// ============ 10. KẾT ============
{
  const els = [
    img('bg-closing.jpg', 0, 0, SW, SH),
    img('scrim-bottom.png', 0, 0, SW, SH),
    rect(0, 0, SW, SH, C.ink, 0.5),
    img('mark-sm.png', SW / 2 - 0.34, 0.82, 0.68, 0.68),
    txt({ x: 1.6, y: 1.82, w: SW - 3.2, text: 'CHUẨN BỊ TỐT HƠN  ·  PHỐI HỢP NHANH HƠN  ·  ỨNG PHÓ HIỆU QUẢ HƠN', size: 12.5, weight: 'eb', color: C.greenSoft, spacing: 2.4, align: 'center' }),
    txt({ x: 1.35, y: 2.35, w: SW - 2.7, text: 'Chúng ta có thể không kiểm soát được khi nào thiên tai xảy ra, nhưng có thể chuẩn bị tốt hơn khi thiên tai thực sự ập đến.', size: 30, weight: 'eb', color: C.white, lh: 1.3, align: 'center' }),
    rect(SW / 2 - 0.75, 4.32, 1.5, 0.075, C.green, 1, 0.037),
    txt({ x: 2.2, y: 4.68, w: SW - 4.4, text: 'Phần trình bày tiếp theo: Demo hệ thống Ứng Phó Nhanh', size: 16, weight: 'm', color: C.text, align: 'center' }),
    txt({ x: 2.2, y: 5.5, w: SW - 4.4, text: 'Trân trọng cảm ơn Ban Lãnh đạo, Ban Tổ chức và Ban Giám khảo', size: 14, weight: 'sb', color: C.white, align: 'center' }),
    txt({ x: 2.2, y: 6.5, w: SW - 4.4, text: 'ungphonhanh.life', size: 12, weight: 'm', color: C.muted, align: 'center' }),
  ];
  slides.push({ els, notes: 'Chúng ta có thể không kiểm soát được khi nào thiên tai xảy ra, nhưng có thể chuẩn bị tốt hơn, phối hợp nhanh hơn và ứng phó hiệu quả hơn. Mời quý Ban Giám khảo theo dõi phần demo.' });
}

module.exports = slides;

