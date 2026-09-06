import { createServer, Server as HttpServer } from "http";
import { AddressInfo } from "net";
import { JwtService } from "@nestjs/jwt";
import { UserRole } from "@safestock/shared-types";
import { Server } from "socket.io";
import { io as connectClient, Socket as ClientSocket } from "socket.io-client";
import { NotificationGateway } from "../../notification/notification.gateway";
import { WebSocketAuthService } from "../websocket-auth.service";

const SECRET = "websocket-test-secret";

describe("authenticated Socket.IO rooms", () => {
  const users = new Map<string, ReturnType<typeof warehouseUser>>();
  const prisma = { userSession: { findUnique: jest.fn() } };
  const jwt = new JwtService();
  const config = { get: jest.fn(() => SECRET) };
  const clients: ClientSocket[] = [];
  let httpServer: HttpServer;
  let server: Server;
  let baseUrl: string;
  let notifications: { push?: (organizationId: string, role: UserRole, payload: unknown) => void };

  beforeEach(async () => {
    users.clear();
    users.set("user-a", warehouseUser("user-a", "wh-a"));
    users.set("user-b", warehouseUser("user-b", "wh-b"));
    users.set("admin", {
      ...warehouseUser("admin", "wh-unused"),
      role: UserRole.ADMIN,
      warehouseId: null,
      warehouse: null,
      organization: { warehouses: [{ id: "wh-a" }, { id: "wh-b" }] },
    });
    users.set("admin-b", {
      ...warehouseUser("admin-b", "wh-b", "org-b"),
      role: UserRole.ADMIN,
      warehouseId: null,
      warehouse: null,
      organization: { warehouses: [{ id: "wh-b" }] },
    });
    prisma.userSession.findUnique.mockClear();
    // Quy ước của bài test: sid là "sess-<userId>". Phiên chỉ tra ra được khi
    // người dùng của nó có thật, và luôn ở trạng thái còn sống.
    prisma.userSession.findUnique.mockImplementation(({ where }: { where: { id: string } }) => {
      const user = users.get(where.id.replace(/^sess-/, ""));
      return Promise.resolve(user ? { revokedAt: null, user } : null);
    });

    const auth = new WebSocketAuthService(prisma as never, jwt, config as never);
    notifications = {};
    const notification = new NotificationGateway(notifications as never, auth);

    httpServer = createServer();
    server = new Server(httpServer);
    auth.install(server);
    auth.install(server);
    notification.server = server;
    notification.onModuleInit();
    server.on("connection", (client) => {
      notification.handleConnection(client);
    });
    await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
    const address = httpServer.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    for (const client of clients.splice(0)) client.disconnect();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("rejects missing, invalid, expired, and deleted-user tokens during handshake", async () => {
    const invalid = await jwt.signAsync(
      { sub: "user-a", sessionVersion: 0, sid: "sess-user-a" },
      { secret: "wrong-secret" },
    );
    const expired = await jwt.signAsync(
      { sub: "user-a", sessionVersion: 0, sid: "sess-user-a" },
      { secret: SECRET, expiresIn: -1 },
    );
    const deletedUser = await jwt.signAsync(
      { sub: "deleted", sessionVersion: 0, sid: "sess-deleted" },
      { secret: SECRET },
    );

    for (const token of [undefined, invalid, expired, deletedUser]) {
      const client = rejectedClient(baseUrl, token);
      clients.push(client);
      await expect(waitForConnectError(client)).resolves.toBe("Unauthorized");
      expect(client.connected).toBe(false);
    }
  });

  it("does not expose the retired sensor_event channel to warehouse clients", async () => {
    const tokenA = await jwt.signAsync({ sub: "user-a", sessionVersion: 0, sid: "sess-user-a" }, { secret: SECRET });
    const tokenB = await jwt.signAsync({ sub: "user-b", sessionVersion: 0, sid: "sess-user-b" }, { secret: SECRET });
    const [clientA, clientB] = await Promise.all([
      connect(baseUrl, tokenA),
      connect(baseUrl, tokenB),
    ]);
    clients.push(clientA, clientB);
    const receivedA: string[] = [];
    const receivedB: string[] = [];
    clientA.on("sensor_event", (payload: { id: string }) => receivedA.push(payload.id));
    clientB.on("sensor_event", (payload: { id: string }) => receivedB.push(payload.id));

    clientA.emit("join", { warehouseId: "wh-b" });
    await delay(30);
    expect(receivedA).toEqual([]);
    expect(receivedB).toEqual([]);
    expect(prisma.userSession.findUnique).toHaveBeenCalledTimes(2);
  });

  it("derives notification role from the database and isolates organization rooms", async () => {
    const staleAdminToken = await jwt.signAsync(
      { sub: "user-a", role: UserRole.ADMIN, sessionVersion: 0, sid: "sess-user-a" },
      { secret: SECRET },
    );
    const adminToken = await jwt.signAsync({ sub: "admin", sessionVersion: 0, sid: "sess-admin" }, { secret: SECRET });
    const adminBToken = await jwt.signAsync(
      { sub: "admin-b", sessionVersion: 0, sid: "sess-admin-b" },
      { secret: SECRET },
    );
    const [warehouseClient, adminClient, adminBClient] = await Promise.all([
      connect(baseUrl, staleAdminToken),
      connect(baseUrl, adminToken),
      connect(baseUrl, adminBToken),
    ]);
    clients.push(warehouseClient, adminClient, adminBClient);
    const warehouseNotifications: string[] = [];
    const adminNotifications: string[] = [];
    const adminBNotifications: string[] = [];
    warehouseClient.on("notification", (payload: { id: string }) =>
      warehouseNotifications.push(payload.id),
    );
    adminClient.on("notification", (payload: { id: string }) =>
      adminNotifications.push(payload.id),
    );
    adminBClient.on("notification", (payload: { id: string }) =>
      adminBNotifications.push(payload.id),
    );

    warehouseClient.emit("join-role", { role: UserRole.ADMIN });
    await delay(30);
    notifications.push?.("org-a", UserRole.ADMIN, { id: "admin-only" });
    await delay(50);

    expect(warehouseNotifications).toEqual([]);
    expect(adminNotifications).toEqual(["admin-only"]);
    expect(adminBNotifications).toEqual([]);
  });
});

function warehouseUser(id: string, warehouseId: string, organizationId = "org-a") {
  return {
    id,
    email: `${id}@example.test`,
    role: UserRole.WAREHOUSE,
    organizationId,
    warehouseId: warehouseId as string | null,
    sessionVersion: 0,
    warehouse: { organizationId } as { organizationId: string } | null,
    organization: { warehouses: [{ id: warehouseId }] },
  };
}

async function connect(baseUrl: string, token: string): Promise<ClientSocket> {
  const client = connectClient(baseUrl, {
    transports: ["websocket"],
    auth: { token },
    forceNew: true,
    reconnection: false,
  });
  await new Promise<void>((resolve, reject) => {
    client.once("connect", resolve);
    client.once("connect_error", reject);
  });
  return client;
}

function waitForConnectError(client: ClientSocket): Promise<string> {
  return new Promise((resolve) => client.once("connect_error", (error) => resolve(error.message)));
}

function rejectedClient(baseUrl: string, token?: string): ClientSocket {
  return connectClient(baseUrl, {
    transports: ["websocket"],
    auth: token ? { token } : {},
    forceNew: true,
    reconnection: false,
  });
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
