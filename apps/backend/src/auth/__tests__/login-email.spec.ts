import { normalizeLoginEmail } from "../login-email";

describe("normalizeLoginEmail", () => {
  const VALID = "staff";

  it("cắt khoảng trắng dán kèm ở hai đầu", () => {
    // Dán tên đăng nhập từ tài liệu bàn giao thường dính một dấu cách. Ô nhập trông y hệt
    // lúc đúng, nên người dùng đi kiểm tra mật khẩu — sai chỗ hoàn toàn.
    expect(normalizeLoginEmail(`${VALID} `)).toBe(VALID);
    expect(normalizeLoginEmail(` ${VALID}`)).toBe(VALID);
    expect(normalizeLoginEmail(`  ${VALID}  `)).toBe(VALID);
  });

  it("đưa về chữ thường khi bàn phím tự viết hoa chữ đầu", () => {
    expect(normalizeLoginEmail("Staff")).toBe(VALID);
    expect(normalizeLoginEmail("STAFF")).toBe(VALID);
  });

  it("giữ nguyên tên đăng nhập vốn đã chuẩn", () => {
    expect(normalizeLoginEmail(VALID)).toBe(VALID);
  });

  it("chuỗi rỗng vẫn trả chuỗi rỗng, không ném", () => {
    expect(normalizeLoginEmail("   ")).toBe("");
  });
});
