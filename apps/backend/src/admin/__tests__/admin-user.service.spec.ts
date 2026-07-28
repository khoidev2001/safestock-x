import { randomBytes } from "crypto";
import { UserRole } from "@safestock/shared-types";
import { AdminUserService } from "../admin-user.service";

describe("AdminUserService hamlet account identities", () => {
  it.each([
    [UserRole.REPORTER, "tanbinh_baocao"],
    [UserRole.WAREHOUSE, "khotanbinh"],
  ])("derives %s login from the assigned warehouse location key", async (role, expectedLogin) => {
    const prisma = fakePrisma();
    const service = new AdminUserService(prisma as never);
    const runtimePassword = randomBytes(18).toString("base64url");

    await service.create("admin-a", {
      password: runtimePassword,
      fullName: "Tài khoản thôn",
      role,
      warehouseId: "warehouse-a",
    });

    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: expectedLogin,
          role,
          warehouseId: "warehouse-a",
        }),
      }),
    );
  });

  it("requires a warehouse for every warehouse-scoped account", async () => {
    const service = new AdminUserService(fakePrisma() as never);
    const runtimePassword = randomBytes(18).toString("base64url");

    await expect(
      service.create("admin-a", {
        email: "ignored",
        password: runtimePassword,
        fullName: "Trưởng thôn",
        role: UserRole.REPORTER,
      }),
    ).rejects.toThrow("phải được gán một kho");
  });
});

function fakePrisma() {
  return {
    user: {
      findUnique: jest
        .fn()
        .mockResolvedValueOnce({ role: UserRole.ADMIN, organizationId: "org-a" })
        .mockResolvedValueOnce(null),
      create: jest.fn().mockResolvedValue({ id: "user-a" }),
    },
    warehouse: {
      findFirst: jest.fn().mockResolvedValue({ id: "warehouse-a", kind: "HAMLET", locationKey: "tan-binh" }),
    },
  };
}
