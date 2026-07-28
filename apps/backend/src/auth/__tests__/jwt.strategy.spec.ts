import { UnauthorizedException } from "@nestjs/common";
import { UserRole } from "@safestock/shared-types";
import { JwtStrategy } from "../jwt.strategy";

const ACCESS_SECRET = "access-secret-long-enough";

describe("JwtStrategy database-current identity", () => {
  const prisma = { user: { findUnique: jest.fn() } };
  const config = { get: jest.fn(() => ACCESS_SECRET) };
  let strategy: JwtStrategy;

  beforeEach(() => {
    jest.clearAllMocks();
    strategy = new JwtStrategy(config as never, prisma as never);
  });

  it("uses the current database role, organization, warehouse, and email", async () => {
    prisma.user.findUnique.mockResolvedValue(
      currentUser({
        email: "current@example.test",
        role: UserRole.WAREHOUSE,
        organizationId: "org-current",
        warehouseId: "warehouse-current",
        warehouse: { organizationId: "org-current" },
      }),
    );

    await expect(
      strategy.validate({
        sub: "user-1",
        email: "stale@example.test",
        role: UserRole.ADMIN,
        warehouseId: "warehouse-stale",
      }),
    ).resolves.toEqual({
      userId: "user-1",
      email: "current@example.test",
      role: UserRole.WAREHOUSE,
      organizationId: "org-current",
      warehouseId: "warehouse-current",
    });
  });

  it("rejects a token whose subject no longer exists", async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(
      strategy.validate({
        sub: "deleted-user",
        email: "deleted@example.test",
        role: UserRole.ADMIN,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it.each([UserRole.WAREHOUSE, UserRole.REPORTER])(
    "rejects %s when its assigned warehouse is missing",
    async (role) => {
      prisma.user.findUnique.mockResolvedValue(
        currentUser({ role, warehouseId: "missing-warehouse", warehouse: null }),
      );

      await expect(
        strategy.validate({ sub: "user-1", email: "user-1@example.test", role }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    },
  );

  it("rejects an assigned warehouse from another organization", async () => {
    prisma.user.findUnique.mockResolvedValue(
      currentUser({
        role: UserRole.REPORTER,
        organizationId: "org-a",
        warehouseId: "warehouse-b",
        warehouse: { organizationId: "org-b" },
      }),
    );

    await expect(
      strategy.validate({
        sub: "user-1",
        email: "user-1@example.test",
        role: UserRole.REPORTER,
        warehouseId: "warehouse-b",
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("allows an organization-wide admin without a warehouse assignment", async () => {
    prisma.user.findUnique.mockResolvedValue(
      currentUser({ role: UserRole.ADMIN, warehouseId: null, warehouse: null }),
    );

    await expect(
      strategy.validate({
        sub: "user-1",
        email: "stale@example.test",
        role: UserRole.WAREHOUSE,
        warehouseId: "warehouse-stale",
      }),
    ).resolves.toMatchObject({
      userId: "user-1",
      role: UserRole.ADMIN,
      organizationId: "org-a",
      warehouseId: null,
    });
  });
});

function currentUser(
  overrides: Partial<{
    id: string;
    email: string;
    role: UserRole;
    organizationId: string;
    warehouseId: string | null;
    warehouse: { organizationId: string } | null;
  }> = {},
) {
  return {
    id: "user-1",
    email: "user-1@example.test",
    role: UserRole.WAREHOUSE,
    organizationId: "org-a",
    warehouseId: "warehouse-a",
    warehouse: { organizationId: "org-a" },
    ...overrides,
  };
}
