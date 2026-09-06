import { BadRequestException, HttpException } from "@nestjs/common";
import { EmailVerificationPurpose } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { PasswordResetService } from "../password-reset.service";

const VERIFIED_USER = {
  id: "user-1",
  email: "superadmindongxuan",
  fullName: "Nguyễn Khánh Trình",
  notificationEmail: "an@example.com",
  notificationEmailVerifiedAt: new Date("2026-09-01T00:00:00.000Z"),
};

describe("PasswordResetService", () => {
  let prisma: { user: { findUnique: jest.Mock; update: jest.Mock } };
  let verification: { issue: jest.Mock; consume: jest.Mock };
  let service: PasswordResetService;

  beforeEach(() => {
    prisma = { user: { findUnique: jest.fn(), update: jest.fn() } };
    verification = { issue: jest.fn(), consume: jest.fn().mockResolvedValue("an@example.com") };
    service = new PasswordResetService(prisma as never, verification as never);
    prisma.user.findUnique.mockResolvedValue(VERIFIED_USER);
  });

  it("gửi mã tới ĐÚNG email đã xác minh của tài khoản, không phải địa chỉ người gọi khai", async () => {
    await service.requestCode("SuperAdminDongXuan", "1.2.3.4");

    expect(verification.issue).toHaveBeenCalledWith({
      userId: "user-1",
      email: "an@example.com",
      purpose: EmailVerificationPurpose.PASSWORD_RESET,
      recipientName: "Nguyễn Khánh Trình",
    });
  });

  it("tài khoản không tồn tại vẫn trả lời y hệt — không thành công cụ dò tên đăng nhập", async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    const missing = await service.requestCode("khongcoai", "1.2.3.4");

    prisma.user.findUnique.mockResolvedValue(VERIFIED_USER);
    const existing = await service.requestCode("superadmindongxuan", "1.2.3.5");

    expect(missing).toEqual(existing);
    expect(verification.issue).toHaveBeenCalledTimes(1);
  });

  it("tài khoản chưa xác minh email thì không gửi gì, nhưng câu trả lời không đổi", async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...VERIFIED_USER,
      notificationEmail: null,
      notificationEmailVerifiedAt: null,
    });

    await expect(service.requestCode("staff", "1.2.3.4")).resolves.toEqual({
      message: expect.stringContaining("Nếu tên đăng nhập tồn tại"),
    });
    expect(verification.issue).not.toHaveBeenCalled();
  });

  it("chạm hạn mức gửi cũng trả lời y hệt, không lộ tài khoản có thật", async () => {
    verification.issue.mockRejectedValue(new BadRequestException("Vui lòng đợi 42 giây"));

    await expect(service.requestCode("superadmindongxuan", "1.2.3.4")).resolves.toEqual({
      message: expect.stringContaining("Nếu tên đăng nhập tồn tại"),
    });
  });

  it("lỗi hạ tầng (SMTP hỏng) thì phải ném ra, không nuốt", async () => {
    verification.issue.mockRejectedValue(new Error("SMTP down"));

    await expect(service.requestCode("superadmindongxuan", "1.2.3.4")).rejects.toThrow("SMTP down");
  });

  it("chặn một IP gọi quá 10 lần trong 15 phút", async () => {
    for (let i = 0; i < 10; i += 1) await service.requestCode("superadmindongxuan", "9.9.9.9");

    await expect(service.requestCode("superadmindongxuan", "9.9.9.9")).rejects.toBeInstanceOf(
      HttpException,
    );
  });

  it("mã đúng → đổi mật khẩu và cắt mọi phiên đang mở", async () => {
    await service.resetPassword({
      login: "superadmindongxuan",
      code: "123456",
      password: "matkhaumoi123",
    });

    expect(verification.consume).toHaveBeenCalledWith({
      userId: "user-1",
      code: "123456",
      purpose: EmailVerificationPurpose.PASSWORD_RESET,
      expectedEmail: "an@example.com",
    });
    const data = prisma.user.update.mock.calls[0][0].data;
    expect(bcrypt.compareSync("matkhaumoi123", data.passwordHash)).toBe(true);
    expect(data.tokenVersion).toEqual({ increment: 1 });
    expect(data.sessionVersion).toEqual({ increment: 1 });
  });

  it("từ chối mật khẩu mới quá ngắn trước khi tiêu mã", async () => {
    await expect(
      service.resetPassword({ login: "superadmindongxuan", code: "123456", password: "ngan" }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(verification.consume).not.toHaveBeenCalled();
  });

  it("tài khoản không tồn tại báo y như mã sai", async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(
      service.resetPassword({ login: "khongcoai", code: "123456", password: "matkhaumoi123" }),
    ).rejects.toThrow("Mã đã hết hạn hoặc chưa được yêu cầu");
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("mã sai thì KHÔNG đổi mật khẩu", async () => {
    verification.consume.mockRejectedValue(new BadRequestException("Mã không đúng. Còn 3 lần thử."));

    await expect(
      service.resetPassword({ login: "superadmindongxuan", code: "000000", password: "matkhaumoi123" }),
    ).rejects.toThrow("Còn 3 lần thử");
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});
