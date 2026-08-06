import assert from "node:assert/strict";
import { test } from "node:test";

import { thongBaoDangNhapLoi } from "./login-error";

const SAI = new Error("Email hoặc mật khẩu sai");

test("giữ nguyên câu của máy chủ", () => {
  assert.ok(thongBaoDangNhapLoi(SAI, "localhost:3100", "iot123456").startsWith(SAI.message));
});

test("luôn nói rõ đã gọi tới đâu", () => {
  // Cùng một câu "sai mật khẩu" có thể đến từ một máy chủ khác hẳn máy người
  // dùng đang nghĩ tới. Không nói địa chỉ thì không cách nào phát hiện.
  assert.match(thongBaoDangNhapLoi(SAI, "192.168.2.107", "x"), /192\.168\.2\.107/);
});

test("chỉ ra khoảng trắng thừa trong mật khẩu", () => {
  // Mật khẩu dán từ tài liệu bàn giao hay dính một dấu cách. Trên màn hình nó chỉ
  // là thêm một chấm tròn, không ai đếm.
  assert.match(thongBaoDangNhapLoi(SAI, "localhost:3100", "iot123456 "), /khoảng trắng/);
  assert.match(thongBaoDangNhapLoi(SAI, "localhost:3100", " iot123456"), /khoảng trắng/);
});

test("mật khẩu sạch thì không nhắc khoảng trắng", () => {
  assert.doesNotMatch(thongBaoDangNhapLoi(SAI, "localhost:3100", "iot123456"), /khoảng trắng/);
});

test("cảnh báo khi trỏ ra Internet trong lúc máy chủ chạy ngay tại chỗ", () => {
  assert.match(thongBaoDangNhapLoi(SAI, "ungphonhanh.life", "iot123456"), /localhost:3100/);
});

test("ô địa chỉ bỏ trống vẫn nói được mặc định", () => {
  assert.match(thongBaoDangNhapLoi(SAI, "   ", "iot123456"), /localhost:3100/);
});

test("bị khoá tạm thì nói thẳng là chờ, đừng gợi ý sửa mật khẩu", () => {
  // Trong 15 phút khoá, mật khẩu ĐÚNG cũng bị từ chối. Gợi ý "gõ lại mật khẩu"
  // lúc này là đẩy người dùng đi sai hướng, và mỗi lần thử lại còn gia hạn khoá.
  const khoa = Object.assign(new Error("Đã có quá nhiều lần đăng nhập thất bại."), {
    status: 429,
  });

  const ra = thongBaoDangNhapLoi(khoa, "localhost:3100", "iot123456 ");

  assert.match(ra, /15 phút/);
  assert.doesNotMatch(ra, /khoảng trắng/);
});
