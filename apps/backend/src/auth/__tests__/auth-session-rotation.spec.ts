import * as bcrypt from "bcryptjs";
import { UnauthorizedException } from "@nestjs/common";
import { UserRole } from "@safestock/shared-types";
import { AuthService } from "../auth.service";

describe("AuthService session rotation", () => {
  const user = {
    id: "user-1",
    email: "admin",
    passwordHash: bcrypt.hashSync("correct-password", 4),
    fullName: "Admin",
    phone: null,
    notificationEmail: null,
    avatarUrl: null,
    role: UserRole.ADMIN,
    warehouseId: null,
    tokenVersion: 0,
    sessionVersion: 0,
    organization: { name: "UBND xã" },
    warehouse: null,
  };
  const prisma = {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    userSession: {
      create: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const jwt = {
    signAsync: jest.fn(),
    verifyAsync: jest.fn(),
  };
  const config = {
    get: jest.fn((key: string) => key + "-secret"),
  };
  const service = new AuthService(prisma as never, jwt as never, config as never);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.user.findUnique.mockResolvedValue(user);
    prisma.userSession.create.mockResolvedValue({ id: "session-1", tokenVersion: 0 });
    prisma.userSession.findUnique.mockResolvedValue({
      id: "session-1",
      userId: user.id,
      tokenVersion: 0,
      revokedAt: null,
      user,
    });
    prisma.userSession.updateMany.mockResolvedValue({ count: 1 });
    prisma.$transaction.mockResolvedValue([]);
    jwt.signAsync.mockResolvedValueOnce("access").mockResolvedValueOnce("refresh");
  });

  it("mở thêm một phiên khi đăng nhập, KHÔNG thu hồi phiên nào đang chạy", async () => {
    await expect(service.login("admin", "correct-password")).resolves.toMatchObject({
      accessToken: "access",
      refreshToken: "refresh",
    });

    expect(prisma.userSession.create).toHaveBeenCalledWith({
      data: { userId: user.id },
      select: { id: true, tokenVersion: true },
    });
    // Đây là điều kiện then chốt của cả bài test: đăng nhập trên web KHÔNG được
    // đụng tới bộ đếm của người dùng, vì đụng vào là điện thoại bị đá ra ngay.
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(jwt.signAsync).toHaveBeenCalledWith(
      expect.objectContaining({ tokenVersion: 0, sessionVersion: 0, sid: "session-1" }),
      expect.any(Object),
    );
  });

  it("xoay refresh token đúng một lần và chối bản đã dùng rồi", async () => {
    jwt.verifyAsync.mockResolvedValue({
      sub: user.id,
      email: user.email,
      role: user.role,
      warehouseId: null,
      tokenVersion: 0,
      sessionVersion: 0,
      sid: "session-1",
    });

    await service.refresh("refresh-token");
    expect(prisma.userSession.updateMany).toHaveBeenCalledWith({
      where: { id: "session-1", tokenVersion: 0, revokedAt: null },
      data: { tokenVersion: { increment: 1 }, lastUsedAt: expect.any(Date) },
    });

    prisma.userSession.findUnique.mockResolvedValue({
      id: "session-1",
      userId: user.id,
      tokenVersion: 2,
      revokedAt: null,
      user,
    });
    await expect(service.refresh("stale-refresh-token")).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("hai thiết bị gia hạn phiên độc lập, không đá nhau", async () => {
    prisma.userSession.findUnique.mockImplementation(({ where }: { where: { id: string } }) =>
      Promise.resolve({
        id: where.id,
        userId: user.id,
        tokenVersion: 0,
        revokedAt: null,
        user,
      }),
    );

    for (const sid of ["session-web", "session-mobile"]) {
      jwt.signAsync.mockResolvedValueOnce("access").mockResolvedValueOnce("refresh");
      jwt.verifyAsync.mockResolvedValue({
        sub: user.id,
        email: user.email,
        role: user.role,
        warehouseId: null,
        tokenVersion: 0,
        sessionVersion: 0,
        sid,
      });
      // Không ném lỗi: mỗi phiên xoay bộ đếm của riêng nó. Khi bộ đếm còn nằm
      // trên User, lượt thứ hai ở đây chính là lượt bị chối.
      await expect(service.refresh("refresh-token")).resolves.toBeDefined();
    }
  });

  it("giữ nguyên sessionVersion khi gia hạn phiên", async () => {
    jwt.verifyAsync.mockResolvedValue({
      sub: user.id,
      email: user.email,
      role: user.role,
      warehouseId: null,
      tokenVersion: 0,
      sessionVersion: 3,
      sid: "session-1",
    });
    prisma.userSession.findUnique.mockResolvedValue({
      id: "session-1",
      userId: user.id,
      tokenVersion: 0,
      revokedAt: null,
      user: { ...user, sessionVersion: 3 },
    });

    await service.refresh("refresh-token");

    // Gia hạn phiên KHÔNG được đụng tới sessionVersion: access token của các tab
    // và thiết bị khác phải sống tiếp cho tới khi tự hết hạn.
    expect(jwt.signAsync).toHaveBeenCalledWith(
      expect.objectContaining({ tokenVersion: 1, sessionVersion: 3, sid: "session-1" }),
      expect.any(Object),
    );
  });

  it("chối refresh token của phiên đã bị thu hồi", async () => {
    jwt.verifyAsync.mockResolvedValue({
      sub: user.id,
      email: user.email,
      role: user.role,
      warehouseId: null,
      tokenVersion: 0,
      sessionVersion: 0,
      sid: "session-1",
    });
    prisma.userSession.findUnique.mockResolvedValue({
      id: "session-1",
      userId: user.id,
      tokenVersion: 0,
      revokedAt: new Date(),
      user,
    });

    await expect(service.refresh("refresh-token")).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("chối refresh token khi phiên đã bị thu hồi toàn bộ (đổi mật khẩu)", async () => {
    jwt.verifyAsync.mockResolvedValue({
      sub: user.id,
      email: user.email,
      role: user.role,
      warehouseId: null,
      tokenVersion: 0,
      // Token phát trước khi đổi mật khẩu; máy chủ đã tăng lên 1.
      sessionVersion: 0,
      sid: "session-1",
    });
    prisma.userSession.findUnique.mockResolvedValue({
      id: "session-1",
      userId: user.id,
      tokenVersion: 0,
      revokedAt: null,
      user: { ...user, sessionVersion: 1 },
    });

    await expect(service.refresh("refresh-token")).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("đăng xuất chỉ đóng phiên của chính thiết bị đó", async () => {
    await service.revokeSession("session-1");
    expect(prisma.userSession.updateMany).toHaveBeenCalledWith({
      where: { id: "session-1", revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    // Không đụng tới sessionVersion: thiết bị khác của cùng người phải sống tiếp.
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("thu hồi toàn bộ thì cắt cả access token lẫn mọi phiên", async () => {
    await service.revokeSessions(user.id);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: user.id },
      data: { sessionVersion: { increment: 1 } },
    });
    expect(prisma.userSession.updateMany).toHaveBeenCalledWith({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });
});
