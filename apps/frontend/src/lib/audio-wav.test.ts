import assert from "node:assert/strict";
import { test } from "node:test";

import { measureRms, SILENCE_RMS } from "./audio-wav";

test("im lặng số học cho rms bằng 0", () => {
  // Micro ảo của phần mềm đổi giọng trả về đúng số giây nhưng toàn mẫu 0. Đây là
  // cách duy nhất phân biệt nó với "phòng yên tĩnh" — phòng yên vẫn có nhiễu nền.
  assert.equal(measureRms(new Float32Array(16_000)), 0);
});

test("đoạn ghi rỗng không làm vỡ phép chia", () => {
  assert.equal(measureRms(new Float32Array(0)), 0);
});

test("giọng nói bình thường vượt xa ngưỡng", () => {
  const mau = new Float32Array(16_000);
  for (let i = 0; i < mau.length; i++) mau[i] = Math.sin(i / 8) * 0.3;

  assert.ok(measureRms(mau) > SILENCE_RMS * 10);
});

test("giọng nói NHỎ vẫn qua được ngưỡng", () => {
  // Micro rẻ tiền và micro máy ảo thu rất nhỏ. Đặt ngưỡng cao là chặn nhầm người
  // có nói thật rồi bảo họ đi đổi thiết bị — sai còn tệ hơn không báo gì.
  const mau = new Float32Array(16_000);
  for (let i = 0; i < mau.length; i++) mau[i] = Math.sin(i / 8) * 0.01;

  assert.ok(measureRms(mau) > SILENCE_RMS);
});

test("ngưỡng khớp với ngưỡng phía AI service", () => {
  // transcribe.py dùng _SILENCE_RMS = 0.0015. Hai bên lệch nhau thì có vùng xám:
  // trình duyệt cho qua, máy chủ chặn, và thông báo lỗi lại chỉ sai đường.
  assert.equal(SILENCE_RMS, 0.0015);
});
