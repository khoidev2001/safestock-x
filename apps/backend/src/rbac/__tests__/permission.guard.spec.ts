import { ExecutionContext, ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Permission, UserRole } from "@safestock/shared-types";
import { PermissionGuard } from "../permission.guard";

describe("PermissionGuard", () => {
  const reflector = { getAllAndOverride: jest.fn() };
  const guard = new PermissionGuard(reflector as unknown as Reflector);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("authorizes using the current role placed on the request", () => {
    reflector.getAllAndOverride.mockReturnValue([Permission.INVENTORY_ADJUST]);

    expect(
      guard.canActivate(
        contextFor({
          userId: "user-1",
          email: "user-1@example.test",
          role: UserRole.WAREHOUSE,
          organizationId: "org-a",
          warehouseId: "warehouse-a",
        }),
      ),
    ).toBe(true);
  });

  it("denies a downgraded current role even if the token had admin access", () => {
    reflector.getAllAndOverride.mockReturnValue([Permission.ADMIN_USERS]);

    expect(() =>
      guard.canActivate(
        contextFor({
          userId: "user-1",
          email: "user-1@example.test",
          role: UserRole.WAREHOUSE,
          organizationId: "org-a",
          warehouseId: "warehouse-a",
        }),
      ),
    ).toThrow(ForbiddenException);
  });

  it.each([
    { userId: "", email: "user-1@example.test", organizationId: "org-a" },
    { userId: "user-1", email: "", organizationId: "org-a" },
    { userId: "user-1", email: "user-1@example.test", organizationId: "" },
  ])("rejects an incomplete database-current identity", (identity) => {
    reflector.getAllAndOverride.mockReturnValue([Permission.INVENTORY_READ]);

    expect(() =>
      guard.canActivate(
        contextFor({
          ...identity,
          role: UserRole.ADMIN,
          warehouseId: null,
        }),
      ),
    ).toThrow(UnauthorizedException);
  });

  it("does not require identity on a route without RBAC metadata", () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);

    expect(guard.canActivate(contextFor(undefined))).toBe(true);
  });
});

function contextFor(user: Record<string, unknown> | undefined): ExecutionContext {
  return {
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}
