import { planSuperAdminPromotion } from "../super-admin";

const target = { id: "u-moi", email: "superxamoi", fullName: "Người mới" };
const holder = { id: "u-cu", email: "superxacu", fullName: "Người cũ" };

describe("planSuperAdminPromotion", () => {
  it("nâng bậc bình thường khi hệ thống chưa có super admin", () => {
    expect(planSuperAdminPromotion({ target, currentSuperAdmin: null, transfer: false })).toEqual({
      promoteId: "u-moi",
      demoteId: null,
    });
  });

  it("chạy lại trên chính super admin hiện tại thì không hạ ai cả", () => {
    expect(
      planSuperAdminPromotion({ target, currentSuperAdmin: target, transfer: false }),
    ).toEqual({ promoteId: "u-moi", demoteId: null });
  });

  it("từ chối tạo super admin thứ hai", () => {
    expect(() =>
      planSuperAdminPromotion({ target, currentSuperAdmin: holder, transfer: false }),
    ).toThrow("đã có super admin");
  });

  it("chuyển giao thì hạ super admin cũ xuống admin thường", () => {
    expect(planSuperAdminPromotion({ target, currentSuperAdmin: holder, transfer: true })).toEqual({
      promoteId: "u-moi",
      demoteId: "u-cu",
    });
  });
});
