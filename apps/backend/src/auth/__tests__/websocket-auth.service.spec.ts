import { JwtService } from "@nestjs/jwt";
import { UserRole } from "@safestock/shared-types";
import { WebSocketAuthService } from "../websocket-auth.service";

const SECRET = "websocket-test-secret";

describe("WebSocketAuthService", () => {
  const users = new Map<string, ReturnType<typeof warehouseUser>>();
  /** Phiên đã thu hồi, tra theo sid — mặc định mọi phiên đều còn sống. */
  const revoked = new Set<string>();
  const prisma = { userSession: { findUnique: jest.fn() } };
  const jwt = new JwtService();
  const config = { get: jest.fn(() => SECRET) };
  let service: WebSocketAuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    users.clear();
    revoked.clear();
    // Quy ước của bài test: sid là "sess-<userId>", nên một token chỉ tra ra
    // phiên khi người dùng của nó có thật.
    prisma.userSession.findUnique.mockImplementation(({ where }: { where: { id: string } }) => {
      const user = users.get(where.id.replace(/^sess-/, ""));
      if (!user) return Promise.resolve(null);
      return Promise.resolve({
        revokedAt: revoked.has(where.id) ? new Date() : null,
        user,
      });
    });
    service = new WebSocketAuthService(prisma as never, jwt, config as never);
  });

  it("rejects missing, invalid, expired, and deleted-user access tokens", async () => {
    await expect(service.authenticate(fakeSocket())).rejects.toThrow("Unauthorized");

    const invalid = await jwt.signAsync(
      { sub: "user-a", sessionVersion: 0, sid: "sess-user-a" },
      { secret: "wrong-secret" },
    );
    await expect(service.authenticate(fakeSocket(invalid))).rejects.toThrow();

    const expired = await jwt.signAsync(
      { sub: "user-a", sessionVersion: 0, sid: "sess-user-a" },
      { secret: SECRET, expiresIn: -1 },
    );
    await expect(service.authenticate(fakeSocket(expired))).rejects.toThrow();

    const deletedUserToken = await jwt.signAsync(
      { sub: "deleted", sessionVersion: 0, sid: "sess-deleted" },
      { secret: SECRET },
    );
    await expect(service.authenticate(fakeSocket(deletedUserToken))).rejects.toThrow(
      "Unauthorized",
    );
  });

  it("uses current database role and assignment instead of stale token claims", async () => {
    users.set("user-a", warehouseUser("user-a", "wh-a"));
    const token = await jwt.signAsync(
      { sub: "user-a", role: UserRole.ADMIN, warehouseId: "wh-b", sessionVersion: 0, sid: "sess-user-a" },
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
    const token = await jwt.signAsync(
      { sub: "admin", sessionVersion: 0, sid: "sess-admin" },
      { secret: SECRET },
    );

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
    const token = await jwt.signAsync(
      { sub: "user-a", sessionVersion: 0, sid: "sess-user-a" },
      { secret: SECRET },
    );

    await expect(service.authenticate(fakeSocket(token))).rejects.toThrow("Unauthorized");
  });

  it("rejects a socket whose session was logged out", async () => {
    users.set("user-a", warehouseUser("user-a", "wh-a"));
    const token = await jwt.signAsync(
      { sub: "user-a", sessionVersion: 0, sid: "sess-user-a" },
      { secret: SECRET },
    );
    // Ổ cắm socket sống lâu hơn một lượt HTTP, nên phiên đã đăng xuất mà vẫn nối
    // được là thiết bị đã thoát vẫn nghe tiếp thông báo của xã.
    revoked.add("sess-user-a");

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
    sessionVersion: 0,
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
