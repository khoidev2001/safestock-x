import { BadRequestException, ForbiddenException, HttpException, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { EmailVerificationPurpose } from "@prisma/client";
import { UserRole } from "@safestock/shared-types";
import * as bcrypt from "bcryptjs";
import { AuthService } from "../auth.service";
import { maskEmail, requiresLoginOtp } from "../login-otp";

/**
 * Đăng nhập hai bước của tài khoản quản trị.
 *
 * Chữ ký thẻ thử thách dùng JwtService THẬT: phần chống giả mạo thẻ nằm đúng ở bước
 * ký và kiểm chữ ký, giả lập nó là test một thứ không có trong production.
 */
describe("AuthService — mã đăng nhập cho tài khoản quản trị", () => {
  const config = {
    get: jest.fn((key: string) =>
      ({ JWT_ACCESS_SECRET: "access-secret", JWT_REFRESH_SECRET: "refresh-secret" })[key],
    ),
  };
  const jwt = new JwtService({});

  function adminUser(overrides: Record<string, unknown> = {}) {
    return {
      id: "admin-1",
      email: "admindongxuan",
      passwordHash: bcrypt.hashSync("Admin123@", 4),
      fullName: "Quản trị Đồng Xuân",
      role: UserRole.ADMIN,
      isSuperAdmin: false,
      notificationEmail: "trandinhkhoi.xsb@gmail.com",
      notificationEmailVerifiedAt: new Date("2026-09-01T00:00:00Z"),
      warehouseId: null,
      sessionVersion: 3,
      tokenVersion: 0,
      organization: { name: "Hội Chữ thập đỏ xã Đồng Xuân" },
      warehouse: null,
      ...overrides,
    };
  }

  let prisma: {
    user: { findUnique: jest.Mock };
    userSession: { create: jest.Mock };
  };
  let verification: { findPending: jest.Mock; issue: jest.Mock; consume: jest.Mock };
  let service: AuthService;
  let user: ReturnType<typeof adminUser>;

  beforeEach(() => {
    user = adminUser();
    prisma = {
      user: { findUnique: jest.fn(async () => user) },
      userSession: { create: jest.fn(async () => ({ id: "session-1", tokenVersion: 0 })) },
    };
    verification = {
      findPending: jest.fn(async () => null),
      issue: jest.fn(async () => ({
        email: "trandinhkhoi.xsb@gmail.com",
        expiresAt: new Date(Date.now() + 60_000),
        resendAvailableAt: new Date(Date.now() + 60_000),
        delivery: "smtp",
      })),
      consume: jest.fn(async () => "trandinhkhoi.xsb@gmail.com"),
    };
    service = new AuthService(
      prisma as never,
      jwt,
      config as never,
      undefined,
      verification as never,
    );
  });

  it("đúng mật khẩu CHƯA mở phiên: gửi mã tới email đã xác minh và trả thẻ thử thách", async () => {
    const result = await service.login("admindongxuan", "Admin123@");

    expect(result).toMatchObject({ otpRequired: true, email: "tr***b@gmail.com" });
    expect(result).not.toHaveProperty("accessToken");
    expect(result).not.toHaveProperty("refreshToken");
    // Không có phiên nào được tạo trước khi mã đúng — đây là cả ý nghĩa của bước hai.
    expect(prisma.userSession.create).not.toHaveBeenCalled();
    expect(verification.issue).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "admin-1",
        email: "trandinhkhoi.xsb@gmail.com",
        purpose: EmailVerificationPurpose.LOGIN_OTP,
      }),
    );
  });

  it("mã đúng thì mới mở phiên, và mã được đối chiếu đúng luồng + đúng email", async () => {
    const challenge = await service.login("admindongxuan", "Admin123@");
    if (!("otpRequired" in challenge)) throw new Error("phải qua bước mã");

    const session = await service.verifyLoginOtp(challenge.challengeToken, "123456", "1.2.3.4");

    expect(session).toMatchObject({ accessToken: expect.any(String), refreshToken: expect.any(String) });
    expect(prisma.userSession.create).toHaveBeenCalledTimes(1);
    expect(verification.consume).toHaveBeenCalledWith({
      userId: "admin-1",
      code: "123456",
      purpose: EmailVerificationPurpose.LOGIN_OTP,
      expectedEmail: "trandinhkhoi.xsb@gmail.com",
    });
  });

  it("mã sai hoặc hết hạn: KHÔNG mở phiên, câu báo đi thẳng ra người dùng", async () => {
    const challenge = await service.login("admindongxuan", "Admin123@");
    if (!("otpRequired" in challenge)) throw new Error("phải qua bước mã");
    verification.consume.mockRejectedValueOnce(
      new BadRequestException("Mã đã hết hạn. Vui lòng gửi lại mã mới."),
    );

    await expect(service.verifyLoginOtp(challenge.challengeToken, "123456")).rejects.toThrow(
      "Mã đã hết hạn. Vui lòng gửi lại mã mới.",
    );
    expect(prisma.userSession.create).not.toHaveBeenCalled();
  });

  it("bấm Đăng nhập lại khi mã cũ còn hạn: dùng lại mã đó, KHÔNG gửi thư mới", async () => {
    const resendAvailableAt = new Date(Date.now() + 40_000);
    verification.findPending.mockResolvedValueOnce({
      email: "trandinhkhoi.xsb@gmail.com",
      expiresAt: new Date(Date.now() + 40_000),
      resendAvailableAt,
    });

    const result = await service.login("admindongxuan", "Admin123@");

    expect(verification.issue).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      otpRequired: true,
      resendAvailableAt: resendAvailableAt.toISOString(),
    });
  });

  it("thẻ thử thách giả, sai khoá hay đã quá hạn đều không qua được bước mã", async () => {
    await expect(service.verifyLoginOtp("khong-phai-jwt", "123456")).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    // Ký bằng KHOÁ ACCESS thật (không có hậu tố riêng của thẻ thử thách): một access
    // token bị lộ không được dùng làm thẻ thử thách.
    const forged = await jwt.signAsync(
      { sub: "admin-1", typ: "login-otp", sv: 3 },
      { secret: "access-secret", expiresIn: 600 },
    );
    await expect(service.verifyLoginOtp(forged, "123456")).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(verification.consume).not.toHaveBeenCalled();
  });

  it("đổi mật khẩu giữa chừng (sessionVersion tăng) thì thẻ cũ chết theo", async () => {
    const challenge = await service.login("admindongxuan", "Admin123@");
    if (!("otpRequired" in challenge)) throw new Error("phải qua bước mã");
    user = adminUser({ sessionVersion: 4 });

    await expect(service.verifyLoginOtp(challenge.challengeToken, "123456")).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(prisma.userSession.create).not.toHaveBeenCalled();
  });

  it("quản trị chưa có email đã xác minh thì bị chặn, không cấp phiên đi tắt", async () => {
    user = adminUser({ notificationEmailVerifiedAt: null });
    await expect(service.login("admindongxuan", "Admin123@")).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.userSession.create).not.toHaveBeenCalled();
  });

  it("thiếu dịch vụ gửi mã thì CHẶN quản trị đăng nhập, không bỏ qua bước mã", async () => {
    const withoutMail = new AuthService(prisma as never, jwt, config as never);
    await expect(withoutMail.login("admindongxuan", "Admin123@")).rejects.toBeInstanceOf(
      HttpException,
    );
    expect(prisma.userSession.create).not.toHaveBeenCalled();
  });

  it("tài khoản máy `iot` và tài khoản không phải quản trị vào thẳng, không qua bước mã", async () => {
    user = adminUser({ email: "iot", notificationEmail: null, notificationEmailVerifiedAt: null });
    await expect(service.login("iot", "Admin123@")).resolves.toHaveProperty("accessToken");

    user = adminUser({ email: "dongxuan", role: UserRole.WAREHOUSE });
    await expect(service.login("dongxuan", "Admin123@")).resolves.toHaveProperty("accessToken");
    expect(verification.issue).not.toHaveBeenCalled();
  });

  it("chống spam theo IP: quá 10 lượt xin gửi lại trong 15 phút thì bị chặn 429", async () => {
    const challenge = await service.login("admindongxuan", "Admin123@");
    if (!("otpRequired" in challenge)) throw new Error("phải qua bước mã");
    for (let index = 0; index < 10; index += 1) {
      await service.resendLoginOtp(challenge.challengeToken, "9.9.9.9");
    }
    const blocked = service.resendLoginOtp(challenge.challengeToken, "9.9.9.9");
    await expect(blocked).rejects.toBeInstanceOf(HttpException);
    await expect(service.resendLoginOtp(challenge.challengeToken, "9.9.9.9")).rejects.toMatchObject({
      status: 429,
    });
  });
});

describe("login-otp — phần quyết định", () => {
  it("chỉ ADMIN cần mã, trừ đúng tài khoản máy `iot`", () => {
    expect(requiresLoginOtp({ role: UserRole.ADMIN, email: "superadmin" })).toBe(true);
    expect(requiresLoginOtp({ role: UserRole.ADMIN, email: "iot" })).toBe(false);
    expect(requiresLoginOtp({ role: UserRole.WAREHOUSE, email: "dongxuan" })).toBe(false);
    expect(requiresLoginOtp({ role: UserRole.RESCUE, email: "cuuho" })).toBe(false);
  });

  it("che email vừa đủ để chủ tài khoản nhận ra", () => {
    expect(maskEmail("trandinhkhoi.dx@gmail.com")).toBe("tr***x@gmail.com");
    expect(maskEmail("ab@x.vn")).toBe("a***@x.vn");
  });
});
