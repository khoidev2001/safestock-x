import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { EmailVerificationPurpose, Prisma } from "@prisma/client";
import { UserRole } from "@safestock/shared-types";
import { AdminUserService } from "../admin-user.service";

const SUPER_ADMIN = { id: "super-1", role: UserRole.ADMIN, isSuperAdmin: true };
const PLAIN_ADMIN = { id: "admin-2", role: UserRole.ADMIN, isSuperAdmin: false };

function makePrisma() {
  return {
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    organization: { findFirst: jest.fn().mockResolvedValue({ id: "org-1" }) },
    warehouse: { findUnique: jest.fn() },
  };
}

function makeVerification() {
  return {
    normalizeEmail: (value: string) => String(value ?? "").trim().toLowerCase(),
    assertEmailShape: jest.fn(),
    issue: jest.fn().mockResolvedValue({ email: "admin@example.com", expiresAt: new Date() }),
    consume: jest.fn().mockResolvedValue("admin@example.com"),
  };
}

describe("AdminUserService — phân bậc super admin", () => {
  let prisma: ReturnType<typeof makePrisma>;
  let verification: ReturnType<typeof makeVerification>;
  let service: AdminUserService;

  beforeEach(() => {
    prisma = makePrisma();
    verification = makeVerification();
    service = new AdminUserService(prisma as never, verification as never);
    prisma.user.create.mockResolvedValue({ id: "new-1" });
  });

  const adminInput = {
    email: "adminmoi",
    password: "matkhau123",
    fullName: "Quản trị mới",
    role: UserRole.ADMIN,
    notificationEmail: "admin@example.com",
    verificationCode: "123456",
  };

  it("super admin tạo được ADMIN và email đi kèm được đánh dấu đã xác minh", async () => {
    prisma.user.findUnique.mockResolvedValueOnce(SUPER_ADMIN).mockResolvedValueOnce(null);

    await service.create("super-1", adminInput);

    expect(verification.consume).toHaveBeenCalledWith({
      userId: "super-1",
      code: "123456",
      purpose: EmailVerificationPurpose.ADMIN_ACCOUNT,
      expectedEmail: "admin@example.com",
    });
    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          role: UserRole.ADMIN,
          notificationEmail: "admin@example.com",
          notificationEmailVerifiedAt: expect.any(Date),
        }),
      }),
    );
  });

  it("không tạo ADMIN khi thiếu mã xác minh", async () => {
    prisma.user.findUnique.mockResolvedValueOnce(SUPER_ADMIN).mockResolvedValueOnce(null);

    await expect(
      service.create("super-1", { ...adminInput, verificationCode: undefined }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it("admin thường không tạo được tài khoản ADMIN", async () => {
    prisma.user.findUnique.mockResolvedValueOnce(PLAIN_ADMIN);

    await expect(service.create("admin-2", adminInput)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it("admin thường vẫn tạo được tài khoản bậc dưới, không cần mã", async () => {
    prisma.user.findUnique.mockResolvedValueOnce(PLAIN_ADMIN).mockResolvedValueOnce(null);

    await service.create("admin-2", {
      email: "truongthon",
      password: "matkhau123",
      fullName: "Trưởng thôn",
      role: UserRole.WAREHOUSE,
    });

    expect(verification.consume).not.toHaveBeenCalled();
    expect(prisma.user.create).toHaveBeenCalled();
  });

  it("không ai xoá được tài khoản super admin", async () => {
    prisma.user.findUnique
      .mockResolvedValueOnce(SUPER_ADMIN)
      .mockResolvedValueOnce({ id: "super-2", email: "supernua", role: UserRole.ADMIN, isSuperAdmin: true });

    await expect(service.remove("super-1", "super-2")).rejects.toThrow("super admin");
    expect(prisma.user.delete).not.toHaveBeenCalled();
  });

  it("admin thường không xoá được tài khoản ADMIN khác", async () => {
    prisma.user.findUnique
      .mockResolvedValueOnce(PLAIN_ADMIN)
      .mockResolvedValueOnce({ id: "admin-3", email: "adminkhac", role: UserRole.ADMIN, isSuperAdmin: false });

    await expect(service.remove("admin-2", "admin-3")).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.user.delete).not.toHaveBeenCalled();
  });

  it("super admin xoá được tài khoản ADMIN thường", async () => {
    prisma.user.findUnique
      .mockResolvedValueOnce(SUPER_ADMIN)
      .mockResolvedValueOnce({ id: "admin-3", email: "adminkhac", role: UserRole.ADMIN, isSuperAdmin: false });

    await expect(service.remove("super-1", "admin-3")).resolves.toEqual({ deleted: true });
    expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: "admin-3" } });
  });

  it("không xoá được chính tài khoản đang đăng nhập", async () => {
    prisma.user.findUnique
      .mockResolvedValueOnce(PLAIN_ADMIN)
      .mockResolvedValueOnce({ id: "admin-2", email: "admin2", role: UserRole.ADMIN, isSuperAdmin: false });

    await expect(service.remove("admin-2", "admin-2")).rejects.toThrow("đang đăng nhập");
  });

  it("giải thích rõ khi tài khoản còn dính giao dịch kho nên DB chặn xoá", async () => {
    prisma.user.findUnique
      .mockResolvedValueOnce(SUPER_ADMIN)
      .mockResolvedValueOnce({ id: "kho-1", email: "tanan", role: UserRole.WAREHOUSE, isSuperAdmin: false });
    prisma.user.delete.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("FK", { code: "P2003", clientVersion: "5" }),
    );

    await expect(service.remove("super-1", "kho-1")).rejects.toThrow("giao dịch kho");
  });

  it("admin thường không sửa được tài khoản super admin", async () => {
    prisma.user.findUnique
      .mockResolvedValueOnce(PLAIN_ADMIN)
      .mockResolvedValueOnce({ id: "super-1", email: "super", role: UserRole.ADMIN, isSuperAdmin: true });

    await expect(
      service.update("admin-2", "super-1", { password: "matkhaumoi" }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("chỉ super admin mới xin được mã tạo tài khoản quản trị", async () => {
    prisma.user.findUnique.mockResolvedValueOnce(PLAIN_ADMIN);

    await expect(
      service.requestAdminEmailCode("admin-2", "admin@example.com"),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(verification.issue).not.toHaveBeenCalled();
  });
});
