import { BadRequestException, ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { AdminUserService } from "../../admin/admin-user.service";
import { AuthService } from "../../auth/auth.service";
import { JwtStrategy } from "../../auth/jwt.strategy";
import { UserRole } from "@safestock/shared-types";

describe("simulation system actor protection", () => {
  const email = "system-loadcell+warehouse-1@local.invalid";

  it("không cho actor hệ thống đăng nhập dù mật khẩu đã biết", async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: "system-actor",
          email,
          passwordHash: "$2a$10$known",
          role: UserRole.WAREHOUSE,
          warehouseId: "warehouse-1",
        }),
      },
    };
    const service = new AuthService(prisma as never, {} as never, {} as never);

    await expect(service.login(email, "known-password")).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("từ chối access token cũ của actor hệ thống", async () => {
    const strategy = new JwtStrategy({ get: () => "access-secret-long-enough" } as never);

    await expect(
      strategy.validate({
        sub: "system-actor",
        email,
        role: UserRole.WAREHOUSE,
        warehouseId: "warehouse-1",
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("admin không thể tạo reserved identity", async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          role: UserRole.ADMIN,
          organizationId: "organization-1",
        }),
      },
      warehouse: {
        findFirst: jest.fn().mockResolvedValue({
          id: "warehouse-1",
          kind: "CENTRAL",
          locationKey: null,
        }),
      },
    };
    const service = new AdminUserService(prisma as never);

    await expect(
      service.create("admin-1", {
        email,
        password: "known-password",
        fullName: "[SYSTEM] Loadcell warehouse-1",
        role: UserRole.WAREHOUSE,
        warehouseId: "warehouse-1",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.user.findUnique).toHaveBeenCalledTimes(1);
  });

  it.each(["update", "remove"] as const)("admin không thể %s actor hệ thống", async (method) => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          role: UserRole.ADMIN,
          organizationId: "organization-1",
        }),
        findFirst: jest.fn().mockResolvedValue({ id: "system-actor", email }),
      },
    };
    const service = new AdminUserService(prisma as never);

    const operation =
      method === "update"
        ? service.update("admin-1", "system-actor", { fullName: "Changed" })
        : service.remove("admin-1", "system-actor");
    await expect(operation).rejects.toBeInstanceOf(ForbiddenException);
  });
});
