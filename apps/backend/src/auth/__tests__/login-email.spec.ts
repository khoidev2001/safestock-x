import { normalizeLoginEmail } from "../login-email";

describe("normalizeLoginEmail", () => {
  const DUNG = "staff@ungphonhanh.life";

  it("cắt khoảng trắng dán kèm ở hai đầu", () => {
    // Dán email từ tài liệu bàn giao thường dính một dấu cách. Ô nhập trông y hệt
    // lúc đúng, nên người dùng đi kiểm tra mật khẩu — sai chỗ hoàn toàn.
    expect(normalizeLoginEmail(`${DUNG} `)).toBe(DUNG);
    expect(normalizeLoginEmail(` ${DUNG}`)).toBe(DUNG);
    expect(normalizeLoginEmail(`  ${DUNG}  `)).toBe(DUNG);
  });

  it("đưa về chữ thường khi bàn phím tự viết hoa chữ đầu", () => {
    expect(normalizeLoginEmail("Staff@ungphonhanh.life")).toBe(DUNG);
    expect(normalizeLoginEmail("STAFF@UNGPHONHANH.LIFE")).toBe(DUNG);
  });

  it("giữ nguyên email vốn đã chuẩn", () => {
    expect(normalizeLoginEmail(DUNG)).toBe(DUNG);
  });

  it("chuỗi rỗng vẫn trả chuỗi rỗng, không ném", () => {
    expect(normalizeLoginEmail("   ")).toBe("");
  });
});
