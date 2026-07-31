import { JwtService } from "@nestjs/jwt";
import { UserRole } from "@safestock/shared-types";
import { WebSocketAuthService } from "../websocket-auth.service";

const SECRET = "websocket-test-secret";

describe("WebSocketAuthService", () => {
  const users = new Map<string, ReturnType<typeof warehouseUser>>();
  const prisma = { user: { findUnique: jest.fn() } };
  const jwt = new JwtService();
  const config = { get: jest.fn(() => SECRET) };
  let service: WebSocketAuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    users.clear();
    prisma.user.findUnique.mockImplementation(({ where }: { where: { id: string } }) =>
      Promise.resolve(users.get(where.id) ?? null),
    );
    service = new WebSocketAuthService(prisma as never, jwt, config as never);
  });

  it("rejects missing, invalid, expired, and deleted-user access tokens", async () => {
    await expect(service.authenticate(fakeSocket())).rejects.toThrow("Unauthorized");

    const invalid = await jwt.signAsync(
      { sub: "user-a", tokenVersion: 0 },
      { secret: "wrong-secret" },
    );
    await expect(service.authenticate(fakeSocket(invalid))).rejects.toThrow();

    const expired = await jwt.signAsync(
      { sub: "user-a", tokenVersion: 0 },
      { secret: SECRET, expiresIn: -1 },
    );
    await expect(service.authenticate(fakeSocket(expired))).rejects.toThrow();

    const deletedUserToken = await jwt.signAsync(
      { sub: "deleted", tokenVersion: 0 },
      { secret: SECRET },
    );
    await expect(service.authenticate(fakeSocket(deletedUserToken))).rejects.toThrow(
      "Unauthorized",
    );
  });

  it("uses current database role and assignment instead of stale token claims", async () => {
    users.set("user-a", warehouseUser("user-a", "wh-a"));
    const token = await jwt.signAsync(
      { sub: "user-a", role: UserRole.ADMIN, warehouseId: "wh-b", tokenVersion: 0 },
      { secret: SECRET },
    );

    await expect(service.authenticate(fakeSocket(token))).resolves.toMatchObject({
      userId: "user-a",
      role: UserRole.WAREHOUSE,
      warehouseIds: ["wh-a"],
    });
  });

  it("grants commune-wide users only warehouses from their organization", async () => {
    users.set("admin", {
      ...warehouseUser("admin", "wh-unused"),
      role: UserRole.ADMIN,
      warehouseId: null,
      warehouse: null,
      organization: { warehouses: [{ id: "wh-a" }, { id: "wh-b" }] },
    });
    const token = await jwt.signAsync({ sub: "admin", tokenVersion: 0 }, { secret: SECRET });

    await expect(service.authenticate(fakeSocket(token))).resolves.toMatchObject({
      role: UserRole.ADMIN,
      warehouseIds: ["wh-a", "wh-b"],
    });
  });

  it("rejects an assigned warehouse from another organization", async () => {
    users.set("user-a", {
      ...warehouseUser("user-a", "wh-a"),
      warehouse: { organizationId: "org-b" },
    });
    const token = await jwt.signAsync({ sub: "user-a" }, { secret: SECRET });

    await expect(service.authenticate(fakeSocket(token))).rejects.toThrow("Unauthorized");
  });
});

function warehouseUser(id: string, warehouseId: string) {
  return {
    id,
    email: `${id}@example.test`,
    role: UserRole.WAREHOUSE,
    organizationId: "org-a",
    warehouseId: warehouseId as string | null,
    tokenVersion: 0,
    warehouse: { organizationId: "org-a" } as { organizationId: string } | null,
    organization: { warehouses: [{ id: warehouseId }] },
  };
}

function fakeSocket(token?: string) {
  return {
    handshake: { auth: token ? { token } : {}, headers: {} },
    data: {},
  } as never;
}
