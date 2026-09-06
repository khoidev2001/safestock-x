import assert from "node:assert/strict";
import { test } from "node:test";

import {
  coordinateParseMessage,
  formatCoordinate,
  isInsideBounds,
  parseCoordinateInput,
} from "./coordinate-input";

test("chép nguyên dòng toạ độ từ bản đồ điều phối là ghim được", () => {
  const result = parseCoordinateInput("13.353243, 109.082512");
  assert.ok(result.ok);
  assert.deepEqual(result.point, { lat: 13.353243, lng: 109.082512 });
});

test("đọc qua điện thoại rồi gõ rời cũng nhận: khoảng trắng, chấm phẩy, ngoặc, ký hiệu độ", () => {
  for (const raw of [
    "  13.353243   109.082512 ",
    "13.353243; 109.082512",
    "(13.353243, 109.082512)",
    "13.353243°, 109.082512°",
  ]) {
    const result = parseCoordinateInput(raw);
    assert.ok(result.ok, raw);
    assert.equal(result.point.lat, 13.353243);
    assert.equal(result.point.lng, 109.082512);
  }
});

test("chuỗi hỏng bị từ chối chứ không ghim đại một nửa", () => {
  // parseFloat("13.35abc") trả 13.35 — đúng cái bẫy khiến một toạ độ chép thiếu
  // vẫn hiện ra dấu ghim trông như thật.
  assert.deepEqual(parseCoordinateInput("13.35abc, 109.08"), { ok: false, reason: "format" });
  assert.deepEqual(parseCoordinateInput("13.353243"), { ok: false, reason: "format" });
  assert.deepEqual(parseCoordinateInput("13.35, 109.08, 20"), { ok: false, reason: "format" });
  assert.deepEqual(parseCoordinateInput("   "), { ok: false, reason: "empty" });
});

test("số ngoài dải vĩ/kinh độ là lỗi riêng — nhập ngược thứ tự rơi đúng vào đây", () => {
  // Dán ngược "kinh độ, vĩ độ" là lỗi hay gặp nhất khi chép tay. KHÔNG tự đảo lại
  // giúp: đoán hộ thì có lúc đoán đúng, có lúc ghim ra một chỗ chẳng ai kiểm tra.
  assert.deepEqual(parseCoordinateInput("109.082512, 13.353243"), { ok: false, reason: "range" });
  assert.deepEqual(parseCoordinateInput("191.2, 13.3"), { ok: false, reason: "range" });
  assert.deepEqual(parseCoordinateInput("13.3, 200.5"), { ok: false, reason: "range" });
});

test("mỗi lỗi có một câu chỉ đúng việc phải sửa", () => {
  assert.match(coordinateParseMessage("format"), /hai số/u);
  assert.match(coordinateParseMessage("range"), /-90/u);
  assert.match(coordinateParseMessage("empty"), /13\.353243/u);
});

test("viết lại đúng dạng đang hiện dưới bản đồ điều phối", () => {
  assert.equal(formatCoordinate({ lat: 13.3532, lng: 109.0825 }), "13.353200, 109.082500");
});

test("khung tile: trong thì ghim được, ngoài thì báo trước kẻo bản đồ dội về", () => {
  const cluster: [[number, number], [number, number]] = [
    [13.23, 108.94],
    [13.62, 109.26],
  ];
  assert.equal(isInsideBounds({ lat: 13.353243, lng: 109.082512 }, cluster), true);
  assert.equal(
    isInsideBounds({ lat: 13.23, lng: 108.94 }, cluster),
    true,
    "đúng mép vẫn tính là trong",
  );
  assert.equal(isInsideBounds({ lat: 12.9, lng: 109.0 }, cluster), false);
  assert.equal(isInsideBounds({ lat: 13.4, lng: 110.5 }, cluster), false);
});
