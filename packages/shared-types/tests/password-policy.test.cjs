const test = require("node:test");
const assert = require("node:assert/strict");
const { passwordPolicyViolation, missingPasswordRules } = require("../dist");

test("ba mật khẩu được cấp cho demo đều đạt", () => {
  for (const password of ["Spadmin123@", "Admin123@"]) {
    assert.equal(passwordPolicyViolation(password), null, password);
  }
});

test("thiếu điều kiện nào thì báo đúng điều đó, gộp trong một câu", () => {
  assert.deepEqual(missingPasswordRules("admin123").map((r) => r.key), ["uppercase", "special"]);
  assert.deepEqual(missingPasswordRules("Ab1@").map((r) => r.key), ["length"]);
  assert.deepEqual(missingPasswordRules("ADMINADMIN").map((r) => r.key), ["digit", "special"]);
  assert.match(passwordPolicyViolation("admin123"), /chữ in hoa.*ký tự đặc biệt/);
});

test("khoảng trắng không tính là ký tự đặc biệt; chữ hoa tiếng Việt vẫn tính là chữ hoa", () => {
  // Khoảng trắng cuối do gõ vội không phải là một ký tự đặc biệt người dùng cố ý đặt.
  assert.deepEqual(missingPasswordRules("Admin1234 ").map((r) => r.key), ["special"]);
  assert.equal(passwordPolicyViolation("Đồngxuân1!"), null);
});

test("độ dài đếm theo ký tự, không theo đơn vị UTF-16", () => {
  // 7 ký tự có dấu vẫn là 7 — không được lọt qua ngưỡng 8 chỉ vì bị đếm thành nhiều mã.
  assert.deepEqual(missingPasswordRules("Ấ1@ấấấấ").map((r) => r.key), ["length"]);
});
