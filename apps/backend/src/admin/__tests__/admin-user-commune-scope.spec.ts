import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { UserRole } from "@safestock/shared-types";
import { AdminUserService } from "../admin-user.service";

/**
 * Ranh giới xã trong màn quản lý tài khoản.
 *
 * Lỗi thật đã xảy ra: quản trị viên xã Xuân Thọ mở màn Tài khoản và thấy đủ 27
 * tài khoản của cả huyện — trong đó có toàn bộ trưởng thôn của xã Đồng Xuân, kèm
 * số điện thoại và email nhận cảnh báo. Màn đó có sẵn nút Sửa và Xoá, và cả hai
 * đều chạy thật khi bấm vào tài khoản xã khác.
 *
 * Mỗi bài dưới đây tương ứng một đường đã thủng, không phải một giả định.
 */

const XUAN_THO_ADMIN = {
  id: "admin-xuan-tho",
  role: UserRole.ADMIN,
  isSuperAdmin: false,
  organizationId: "org-xuan-tho",
};
const SUPER_ADMIN = {
  id: "super-1",
  role: UserRole.ADMIN,
  isSuperAdmin: true,
  organizationId: "org-dong-xuan",
};
/** Trưởng thôn Long Châu — người của xã Đồng Xuân, không liên quan tới Xuân Thọ. */
const LONG_CHAU = {
  id: "user-long-chau",
  email: "longchau",
  role: UserRole.WAREHOUSE,
  isSuperAdmin: false,
  organizationId: "org-dong-xuan",
  warehouseId: "kho-long-chau",
};

function makePrisma() {
  return {
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: "new-1" }),
      update: jest.fn().mockResolvedValue({ id: LONG_CHAU.id }),
      delete: jest.fn().mockResolvedValue({ id: LONG_CHAU.id }),
    },
    organization: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn() },
    warehouse: { findUnique: jest.fn() },
  };
}

function makeVerification() {
  return {
    normalizeEmail: (value: string) =>
      String(value ?? "")
        .trim()
        .toLowerCase(),
    assertEmailShape: jest.fn(),
    issue: jest.fn(),
    consume: jest.fn(),
  };
}

describe("AdminUserService — ranh giới giữa các xã", () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: AdminUserService;

  beforeEach(() => {
    prisma = makePrisma();
    service = new AdminUserService(prisma as never, makeVerification() as never);
  });

  describe("xem danh sách", () => {
    it("quản trị viên xã chỉ thấy tài khoản của xã mình", async () => {
      prisma.user.findUnique.mockResolvedValueOnce(XUAN_THO_ADMIN);

      await service.list(XUAN_THO_ADMIN.id);

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId: "org-xuan-tho" } }),
      );
    });

    it("super admin vẫn thấy cả huyện — đó là bậc dựng tài khoản quản trị cho từng xã", async () => {
      prisma.user.findUnique.mockResolvedValueOnce(SUPER_ADMIN);

      await service.list(SUPER_ADMIN.id);

      expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));
    });
  });

  describe("sửa tài khoản", () => {
    it("không sửa được tài khoản của xã khác", async () => {
      prisma.user.findUnique.mockResolvedValueOnce(XUAN_THO_ADMIN).mockResolvedValueOnce(LONG_CHAU);

      await expect(
        service.update(XUAN_THO_ADMIN.id, LONG_CHAU.id, { fullName: "Tên khác" }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it("báo KHÔNG TÌM THẤY chứ không phải KHÔNG CÓ QUYỀN — không xác nhận id đó có thật", async () => {
      prisma.user.findUnique.mockResolvedValueOnce(XUAN_THO_ADMIN).mockResolvedValueOnce(LONG_CHAU);

      await expect(
        service.update(XUAN_THO_ADMIN.id, LONG_CHAU.id, { fullName: "Tên khác" }),
      ).rejects.not.toBeInstanceOf(ForbiddenException);
    });

    it("vẫn sửa được người của chính xã mình", async () => {
      const ownStaff = { ...LONG_CHAU, id: "user-xt", organizationId: "org-xuan-tho" };
      prisma.user.findUnique.mockResolvedValueOnce(XUAN_THO_ADMIN).mockResolvedValueOnce(ownStaff);

      await service.update(XUAN_THO_ADMIN.id, ownStaff.id, { fullName: "Tên mới" });

      expect(prisma.user.update).toHaveBeenCalled();
    });
  });

  describe("xoá tài khoản", () => {
    it("không xoá được tài khoản của xã khác", async () => {
      prisma.user.findUnique.mockResolvedValueOnce(XUAN_THO_ADMIN).mockResolvedValueOnce(LONG_CHAU);

      await expect(service.remove(XUAN_THO_ADMIN.id, LONG_CHAU.id)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.user.delete).not.toHaveBeenCalled();
    });
  });

  describe("gán kho", () => {
    it("không gán được người của xã mình vào kho của xã khác", async () => {
      const ownStaff = { ...LONG_CHAU, id: "user-xt", organizationId: "org-xuan-tho" };
      prisma.user.findUnique.mockResolvedValueOnce(XUAN_THO_ADMIN).mockResolvedValueOnce(ownStaff);
      // Kho có thật, nhưng thuộc xã Đồng Xuân.
      prisma.warehouse.findUnique.mockResolvedValue({ organizationId: "org-dong-xuan" });

      await expect(
        service.update(XUAN_THO_ADMIN.id, ownStaff.id, { warehouseId: "kho-long-chau" }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it("gán được vào kho cùng xã", async () => {
      const ownStaff = { ...LONG_CHAU, id: "user-xt", organizationId: "org-xuan-tho" };
      prisma.user.findUnique.mockResolvedValueOnce(XUAN_THO_ADMIN).mockResolvedValueOnce(ownStaff);
      prisma.warehouse.findUnique.mockResolvedValue({ organizationId: "org-xuan-tho" });

      await service.update(XUAN_THO_ADMIN.id, ownStaff.id, { warehouseId: "kho-xt" });

      expect(prisma.user.update).toHaveBeenCalled();
    });

    it("tạo tài khoản mới cũng không mượn được kho của xã khác", async () => {
      prisma.user.findUnique.mockResolvedValueOnce(XUAN_THO_ADMIN).mockResolvedValueOnce(null);
      prisma.warehouse.findUnique.mockResolvedValue({ organizationId: "org-dong-xuan" });

      await expect(
        service.create(XUAN_THO_ADMIN.id, {
          email: "nguoimoi",
          password: "matkhau123",
          fullName: "Người mới",
          role: UserRole.WAREHOUSE,
          warehouseId: "kho-long-chau",
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });
  });

  describe("danh sách xã trong huyện", () => {
    it("quản trị viên xã không xem được — họ không tạo tài khoản cho xã khác", async () => {
      prisma.user.findUnique.mockResolvedValueOnce(XUAN_THO_ADMIN);

      await expect(service.listCommunes(XUAN_THO_ADMIN.id)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it("super admin xem được — họ cần chọn xã khi tạo quản trị viên", async () => {
      prisma.user.findUnique.mockResolvedValueOnce(SUPER_ADMIN);

      await expect(service.listCommunes(SUPER_ADMIN.id)).resolves.toEqual([]);
    });
  });
});
