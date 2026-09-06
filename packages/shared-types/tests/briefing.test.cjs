const assert = require("node:assert/strict");
const { test } = require("node:test");

const { splitBriefingSentences } = require("../dist/index.js");

test("mỗi câu một dòng", () => {
  const result = splitBriefingSentences(
    "Kho thôn Long Châu: điểm sẵn sàng 100/100. Chưa mặt hàng nào có nguy cơ thiếu.",
  );

  assert.deepEqual(result, [
    "Kho thôn Long Châu: điểm sẵn sàng 100/100.",
    "Chưa mặt hàng nào có nguy cơ thiếu.",
  ]);
});

test("KHÔNG cắt ở dấu chấm thập phân", () => {
  // Bản tin đầy số thập phân. Cắt nhầm ở đây là biến "1.6 mm" thành hai dòng vô
  // nghĩa — lỗi mà một hàm tách câu ngây thơ luôn mắc.
  const result = splitBriefingSentences(
    "Mưa theo mốc: 24 giờ tới 1.6 mm, 48 giờ tới 2.7 mm. Gió mạnh nhất 23.2 km/h.",
  );

  assert.equal(result.length, 2);
  assert.ok(result[0].includes("1.6 mm"));
  assert.ok(result[1].includes("23.2 km/h"));
});

test("bỏ dòng trống, cắt khoảng trắng thừa", () => {
  assert.deepEqual(splitBriefingSentences("  Một câu.   Câu hai.  "), ["Một câu.", "Câu hai."]);
});

test("bản tin rỗng trả mảng rỗng, không ném", () => {
  assert.deepEqual(splitBriefingSentences(""), []);
  assert.deepEqual(splitBriefingSentences("   "), []);
});
