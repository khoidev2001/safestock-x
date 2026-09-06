import { communeNameFromUnitName } from "../commune-name";

describe("communeNameFromUnitName", () => {
  it("cắt tên xã ra khỏi tên đơn vị đầy đủ", () => {
    expect(communeNameFromUnitName("Hội Chữ thập đỏ xã Đồng Xuân")).toBe("Đồng Xuân");
    expect(communeNameFromUnitName("Hội Chữ thập đỏ phường Bến Nghé")).toBe("Bến Nghé");
    expect(communeNameFromUnitName("Hội Chữ thập đỏ thị trấn La Hai")).toBe("La Hai");
  });

  it("không có từ khoá đơn vị hành chính thì giữ NGUYÊN tên", () => {
    // Tên đầy đủ vẫn đọc được; tên cắt sai thì không, mà ở luồng mượn liên xã nó
    // còn bị đem đi so khớp với tên xã bên kia gõ vào.
    expect(communeNameFromUnitName("Ban chỉ huy PCTT Đồng Xuân")).toBe(
      "Ban chỉ huy PCTT Đồng Xuân",
    );
  });

  it("rỗng hoặc thiếu thì trả undefined, không trả chuỗi rỗng", () => {
    expect(communeNameFromUnitName("   ")).toBeUndefined();
    expect(communeNameFromUnitName(null)).toBeUndefined();
    expect(communeNameFromUnitName(undefined)).toBeUndefined();
  });
});
