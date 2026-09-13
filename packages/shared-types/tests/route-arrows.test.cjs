const assert = require("node:assert/strict");
const test = require("node:test");

const { routeArrows, routeArrowSvg } = require("../dist");

/**
 * Một đoạn thẳng CHẠY LÊN PHÍA BẮC, dài khoảng 1,1 km ở vĩ độ Đồng Xuân.
 *
 * Dùng đoạn thẳng đứng để góc phương vị có đáp án biết trước (0°) — kiểm được
 * hướng mà không phải chép lại chính công thức đang kiểm.
 */
const NORTHBOUND = [
  [13.37, 109.1],
  [13.38, 109.1],
];

test("tuyến quá ngắn thì không vẽ mũi tên nào", () => {
  // Kho thôn cấp cho chính thôn mình: tuyến vài chục mét, ở mức phóng thường
  // thấy thì mũi tên che mất cả tuyến lẫn hai dấu ghim ở hai đầu.
  assert.deepEqual(
    routeArrows([
      [13.37, 109.1],
      [13.3703, 109.1],
    ]),
    [],
  );
  assert.deepEqual(routeArrows([]), []);
  assert.deepEqual(routeArrows([[13.37, 109.1]]), []);
});

test("tuyến đủ dài luôn có ít nhất một mũi tên, và nó chỉ đúng hướng đi", () => {
  const arrows = routeArrows(NORTHBOUND);
  assert.ok(arrows.length >= 1);
  // Đi thẳng lên bắc: phương vị 0°.
  assert.ok(Math.abs(arrows[0].bearing) < 0.5, `bearing ${arrows[0].bearing}`);
  // Nằm TRÊN tuyến, không lệch sang bên.
  assert.ok(Math.abs(arrows[0].lng - 109.1) < 1e-9);
  assert.ok(arrows[0].lat > 13.37 && arrows[0].lat < 13.38);
});

test("mũi tên không đặt ở hai đầu — chỗ đó đã có dấu ghim kho và ghim điểm nạn", () => {
  for (const arrow of routeArrows(NORTHBOUND, { spacingMeters: 200 })) {
    assert.ok(arrow.lat > 13.37, "không được trùng điểm đầu");
    assert.ok(arrow.lat < 13.38, "không được trùng điểm cuối");
  }
});

test("rải theo QUÃNG ĐƯỜNG, không theo số điểm của tuyến", () => {
  /*
    Máy chủ định tuyến trả điểm dày ở khúc cua và thưa ở đoạn thẳng dài. Tuyến
    dưới đây có bốn điểm chụm sát nhau ở đầu rồi một đoạn thẳng rất dài — rải
    theo chỉ số mảng thì mũi tên dồn hết vào cụm đầu và cả đoạn dài không có cái
    nào, đúng chỗ người xem cần biết đang đi chiều nào.
  */
  const arrows = routeArrows(
    [
      [13.37, 109.1],
      [13.3701, 109.1],
      [13.3702, 109.1],
      [13.3703, 109.1],
      [13.42, 109.1],
    ],
    { spacingMeters: 1000 },
  );
  assert.ok(arrows.length >= 4);
  // Phần lớn mũi tên phải nằm trên đoạn dài, không phải trong cụm đầu.
  const onLongLeg = arrows.filter((arrow) => arrow.lat > 13.3703).length;
  assert.ok(onLongLeg >= arrows.length - 1, `${onLongLeg}/${arrows.length} nằm trên đoạn dài`);
});

test("số mũi tên có trần — tuyến liên xã dài chục km không biến thành vệt đặc", () => {
  const arrows = routeArrows(
    [
      [13.0, 109.1],
      [13.9, 109.1],
    ],
    { spacingMeters: 100, maxArrows: 6 },
  );
  assert.equal(arrows.length, 6);
});

test("điểm trùng nhau trong dữ liệu tuyến không sinh ra hướng vô nghĩa", () => {
  // Máy chủ định tuyến vẫn trả về điểm lặp; chia cho quãng đường 0 sẽ ra NaN.
  const arrows = routeArrows([
    [13.37, 109.1],
    [13.37, 109.1],
    [13.38, 109.1],
  ]);
  assert.ok(arrows.length >= 1);
  for (const arrow of arrows) {
    assert.ok(Number.isFinite(arrow.lat) && Number.isFinite(arrow.lng));
    assert.ok(Number.isFinite(arrow.bearing));
  }
});

test("hướng lấy từ đúng đoạn mũi tên đang nằm trên, nên nó quay theo khúc cua", () => {
  // Đi lên bắc rồi rẽ sang đông: hai nửa tuyến phải cho hai hướng khác nhau.
  const arrows = routeArrows(
    [
      [13.37, 109.1],
      [13.38, 109.1],
      [13.38, 109.11],
    ],
    { spacingMeters: 400 },
  );
  const bearings = arrows.map((arrow) => Math.round(arrow.bearing));
  assert.ok(bearings.some((bearing) => bearing === 0), `có đoạn đi bắc: ${bearings}`);
  assert.ok(bearings.some((bearing) => bearing === 90), `có đoạn rẽ đông: ${bearings}`);
});

test("hình mũi tên xoay theo phương vị và tô trắng để nổi trên nét màu của tuyến", () => {
  const svg = routeArrowSvg(90, 16, "#1d4ed8");
  assert.match(svg, /rotate\(90\.0deg\)/);
  // Ruột trắng: mũi tên nằm TRONG nét màu nên phải tương phản với chính nét ấy.
  assert.match(svg, /fill="#ffffff"/);
  // Viền lấy màu tuyến, để chỗ mũi tên đè lên mép trắng của tuyến vẫn tách ra được.
  assert.match(svg, /stroke="#1d4ed8"/);
});

test("mũi tên là hình ĐẶC, không phải nét kẻ có quầng trắng", () => {
  // Bản trước vẽ bằng nét: thân màu 3.4 kèm quầng trắng 6.4 trên khung 26px, quy
  // ra 6,9px quầng và 12,8px bề ngang đầu nhọn — trong khi thân tuyến chỉ dày 7px.
  // Mũi tên tràn ra hai bên và cái quầng biến nó thành một cục rời, đọc như dấu
  // ghim rơi trên tuyến. Khoá lại bằng test vì đây là thứ người dùng nhìn thấy.
  const svg = routeArrowSvg(0, 16, "#1d4ed8");
  assert.match(svg, /<polygon /);
  assert.doesNotMatch(svg, /fill="none"/);
  assert.doesNotMatch(svg, /stroke-width="6\.4"/);
});

test("mũi tên hẹp hơn nét tuyến, để nằm lọt lòng chứ không tràn ra hai bên", () => {
  /*
    Đây là ràng buộc số học, không phải thẩm mỹ: thân tuyến vẽ bằng
    `weight: 7` ở cả web (`incident-map.tsx`) lẫn điện thoại
    (`mission-map-html.ts`). Mũi tên rộng hơn 7px là thò ra ngoài đường.

    Đo thẳng từ chuỗi SVG: lấy hoành độ nhỏ nhất và lớn nhất của đa giác trong
    khung 24, cộng bề dày viền, rồi quy về pixel theo cỡ khung.
  */
  const size = 16;
  const svg = routeArrowSvg(0, size, "#1d4ed8");
  const points = svg.match(/points="([^"]+)"/)[1].split(" ").map(Number);
  const xs = points.filter((_, i) => i % 2 === 0);
  const strokeWidth = Number(svg.match(/stroke-width="([\d.]+)"/)[1]);
  const beRongDonVi = Math.max(...xs) - Math.min(...xs) + strokeWidth;
  const beRongPixel = (beRongDonVi / 24) * size;

  const NET_TUYEN_PX = 7;
  assert.ok(
    beRongPixel <= NET_TUYEN_PX,
    `Mũi tên rộng ${beRongPixel.toFixed(2)}px, tràn ra ngoài nét tuyến ${NET_TUYEN_PX}px`,
  );
  // Và phải DÀI hơn RỘNG, không thì nó lại thành một chấm không rõ hướng.
  const ys = points.filter((_, i) => i % 2 === 1);
  assert.ok(Math.max(...ys) - Math.min(...ys) > Math.max(...xs) - Math.min(...xs));
});

test("mũi tên rải THƯA để hai cái liền nhau không dính thành một vệt", () => {
  /*
    Hình nay dài gấp đôi hình cũ, nên khoảng cách mặc định cũng phải rộng ra theo.
    Đo bằng khoảng cách giữa hai mũi tên liền nhau trên một tuyến thẳng dài, chứ
    không đọc lại hằng số — hằng số chỉ là cách hàm đạt được điều này.
  */
  const arrows = routeArrows([
    [13.3, 109.1],
    [13.4, 109.1],
  ]);
  assert.ok(arrows.length >= 2, `cần ít nhất hai mũi tên để đo: ${arrows.length}`);
  // 1 độ vĩ ≈ 111 km, nên 0,004 độ ≈ 445 m.
  const gap = Math.abs(arrows[1].lat - arrows[0].lat);
  assert.ok(gap > 0.004, `hai mũi tên chỉ cách nhau ${(gap * 111000).toFixed(0)} m`);
});
