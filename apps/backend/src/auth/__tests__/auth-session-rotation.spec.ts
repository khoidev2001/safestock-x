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
    organization: { name: "UBND xã" },
    warehouse: null,
  };
  const prisma = {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
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
    prisma.user.update.mockResolvedValue({ ...user, tokenVersion: 1 });
    prisma.user.updateMany.mockResolvedValue({ count: 1 });
    jwt.signAsync.mockResolvedValueOnce("access").mockResolvedValueOnce("refresh");
  });

  it("increments the version before issuing tokens at login", async () => {
    await expect(service.login("admin", "correct-password")).resolves.toMatchObject({
      accessToken: "access",
      refreshToken: "refresh",
    });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: user.id },
      data: { tokenVersion: { increment: 1 } },
      select: expect.objectContaining({ tokenVersion: true }),
    });
    expect(jwt.signAsync).toHaveBeenCalledWith(
      expect.objectContaining({ tokenVersion: 1 }),
      expect.any(Object),
    );
  });

  it("rotates a refresh token exactly once and rejects a stale version", async () => {
    jwt.verifyAsync.mockResolvedValue({
      sub: user.id,
      email: user.email,
      role: user.role,
      warehouseId: null,
      tokenVersion: 0,
    });

    await service.refresh("refresh-token");
    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: { id: user.id, tokenVersion: 0 },
      data: { tokenVersion: { increment: 1 } },
    });

    prisma.user.findUnique.mockResolvedValue({ ...user, tokenVersion: 2 });
    await expect(service.refresh("stale-refresh-token")).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("revokes all previously issued tokens at logout", async () => {
    await service.revokeSessions(user.id);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: user.id },
      data: { tokenVersion: { increment: 1 } },
    });
  });
});
