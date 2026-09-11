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

test("hình mũi tên xoay theo phương vị và có viền trắng để không tan vào ảnh vệ tinh", () => {
  const svg = routeArrowSvg(90, 16, "#1d4ed8");
  assert.match(svg, /rotate\(90\.0deg\)/);
  assert.match(svg, /stroke="#ffffff"/);
  assert.match(svg, /stroke="#1d4ed8"/);
});

test("mũi tên là một GẠCH có đầu nhọn, không phải hình tam giác trơn", () => {
  // Tam giác trơn giữa tuyến đọc ra thành một dấu ghim hay mảnh vụn của lớp bản
  // đồ: không có thân thì mắt không bắt được trục, phải nhìn kỹ mới biết nó chỉ
  // đâu. Khoá lại bằng test vì đây là khác biệt người dùng nhìn thấy, không phải
  // chuyện thẩm mỹ nội bộ.
  const svg = routeArrowSvg(0, 16, "#1d4ed8");
  // Có phần THÂN: một nét thẳng chạy dọc trục giữa khung 24×24.
  assert.match(svg, /M12 20\.6 L12 5\.4/);
  // Và có ĐẦU NHỌN gắn vào đầu thân đó.
  assert.match(svg, /L12 4\.2/);
  // Nét, không phải mảng tô — mảng tô chính là hình tam giác của bản trước.
  assert.match(svg, /fill="none"/);
  assert.doesNotMatch(svg, /fill="#1d4ed8"/);
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
