import { createServer, Server as HttpServer } from "http";
import { AddressInfo } from "net";
import { JwtService } from "@nestjs/jwt";
import { NotificationKind } from "@prisma/client";
import { UserRole } from "@safestock/shared-types";
import { Server } from "socket.io";
import { io as connectClient, Socket as ClientSocket } from "socket.io-client";
import { NotificationGateway } from "../../notification/notification.gateway";
import { NotificationDelivery } from "../../notification/notification.service";
import { SimulationGateway } from "../../simulation/simulation.gateway";
import { WebSocketAuthService } from "../websocket-auth.service";

const SECRET = "websocket-test-secret";

describe("authenticated Socket.IO rooms", () => {
  const users = new Map<string, ReturnType<typeof warehouseUser>>();
  const prisma = { user: { findUnique: jest.fn() } };
  const jwt = new JwtService();
  const config = { get: jest.fn(() => SECRET) };
  const clients: ClientSocket[] = [];
  let httpServer: HttpServer;
  let server: Server;
  let baseUrl: string;
  let runner: { onEvent?: (warehouseId: string, payload: unknown) => void };
  let notifications: { push?: (delivery: NotificationDelivery) => void };

  beforeEach(async () => {
    users.clear();
    users.set("user-a", warehouseUser("user-a", "wh-a"));
    users.set("user-b", warehouseUser("user-b", "wh-b"));
    users.set("admin", adminUser("admin", "org-a"));
    users.set("admin-b", adminUser("admin-b", "org-b"));
    prisma.user.findUnique.mockClear();
    prisma.user.findUnique.mockImplementation(({ where }: { where: { id: string } }) =>
      Promise.resolve(users.get(where.id) ?? null),
    );

    const auth = new WebSocketAuthService(prisma as never, jwt, config as never);
    runner = {};
    notifications = {};
    const simulation = new SimulationGateway(runner as never, auth);
    const notification = new NotificationGateway(notifications as never, auth);

    httpServer = createServer();
    server = new Server(httpServer);
    auth.install(server);
    auth.install(server);
    simulation.server = server;
    notification.server = server;
    simulation.onModuleInit();
    notification.onModuleInit();
    server.on("connection", (client) => {
      simulation.handleConnection(client);
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
    const invalid = await jwt.signAsync({ sub: "user-a" }, { secret: "wrong-secret" });
    const expired = await jwt.signAsync({ sub: "user-a" }, { secret: SECRET, expiresIn: -1 });
    const deletedUser = await jwt.signAsync({ sub: "deleted" }, { secret: SECRET });

    for (const token of [undefined, invalid, expired, deletedUser]) {
      const client = rejectedClient(baseUrl, token);
      clients.push(client);
      await expect(waitForConnectError(client)).resolves.toBe("Unauthorized");
      expect(client.connected).toBe(false);
    }
  });

  it("isolates warehouses and ignores legacy room spoofing events", async () => {
    const tokenA = await jwt.signAsync({ sub: "user-a" }, { secret: SECRET });
    const tokenB = await jwt.signAsync({ sub: "user-b" }, { secret: SECRET });
    const [clientA, clientB] = await Promise.all([
      connect(baseUrl, tokenA),
      connect(baseUrl, tokenB),
    ]);
    clients.push(clientA, clientB);
    const receivedA: string[] = [];
    const receivedB: string[] = [];
    clientA.on("sensor_event", (payload: { id: string }) => receivedA.push(payload.id));
    clientB.on("sensor_event", (payload: { id: string }) => receivedB.push(payload.id));

    runner.onEvent?.("wh-a", { id: "event-a" });
    await delay(50);
    expect(receivedA).toEqual(["event-a"]);
    expect(receivedB).toEqual([]);

    clientA.emit("join", { warehouseId: "wh-b" });
    await delay(30);
    runner.onEvent?.("wh-b", { id: "event-b" });
    await delay(50);

    expect(receivedA).toEqual(["event-a"]);
    expect(receivedB).toEqual(["event-b"]);
    expect(prisma.user.findUnique).toHaveBeenCalledTimes(2);
  });

  it("derives notification role from the database and ignores role spoofing", async () => {
    const staleAdminToken = await jwt.signAsync(
      { sub: "user-a", role: UserRole.ADMIN },
      { secret: SECRET },
    );
    const adminToken = await jwt.signAsync({ sub: "admin" }, { secret: SECRET });
    const [warehouseClient, adminClient] = await Promise.all([
      connect(baseUrl, staleAdminToken),
      connect(baseUrl, adminToken),
    ]);
    clients.push(warehouseClient, adminClient);
    const warehouseNotifications: string[] = [];
    const adminNotifications: string[] = [];
    warehouseClient.on("notification", (payload: { id: string }) =>
      warehouseNotifications.push(payload.id),
    );
    adminClient.on("notification", (payload: { id: string }) =>
      adminNotifications.push(payload.id),
    );

    warehouseClient.emit("join-role", { role: UserRole.ADMIN });
    await delay(30);
    notifications.push?.({
      role: UserRole.ADMIN,
      organizationId: "org-a",
      warehouseId: null,
      recipientUserId: null,
      kind: NotificationKind.INCIDENT_DETECTED,
      notification: { id: "admin-only" },
    });
    await delay(50);

    expect(warehouseNotifications).toEqual([]);
    expect(adminNotifications).toEqual(["admin-only"]);
  });

  it("delivers organization-tagged notifications only to the same organization and role", async () => {
    const [adminA, adminB] = await Promise.all([
      connect(baseUrl, await jwt.signAsync({ sub: "admin" }, { secret: SECRET })),
      connect(baseUrl, await jwt.signAsync({ sub: "admin-b" }, { secret: SECRET })),
    ]);
    clients.push(adminA, adminB);
    const receivedA: string[] = [];
    const receivedB: string[] = [];
    adminA.on("notification", (payload: { id: string }) => receivedA.push(payload.id));
    adminB.on("notification", (payload: { id: string }) => receivedB.push(payload.id));

    notifications.push?.({
      role: UserRole.ADMIN,
      organizationId: "org-a",
      warehouseId: null,
      recipientUserId: null,
      kind: NotificationKind.INCIDENT_REPORTED,
      notification: { id: "org-a-report" },
    });
    await delay(50);

    expect(receivedA).toEqual(["org-a-report"]);
    expect(receivedB).toEqual([]);
  });

  it("retains legacy-neutral delivery but drops orphan incident reports", async () => {
    const [adminA, adminB] = await Promise.all([
      connect(baseUrl, await jwt.signAsync({ sub: "admin" }, { secret: SECRET })),
      connect(baseUrl, await jwt.signAsync({ sub: "admin-b" }, { secret: SECRET })),
    ]);
    clients.push(adminA, adminB);
    const receivedA: string[] = [];
    const receivedB: string[] = [];
    adminA.on("notification", (payload: { id: string }) => receivedA.push(payload.id));
    adminB.on("notification", (payload: { id: string }) => receivedB.push(payload.id));

    notifications.push?.({
      role: UserRole.ADMIN,
      organizationId: null,
      warehouseId: null,
      recipientUserId: null,
      kind: NotificationKind.INCIDENT_DETECTED,
      notification: { id: "legacy-neutral" },
    });
    notifications.push?.({
      role: UserRole.ADMIN,
      organizationId: null,
      warehouseId: null,
      recipientUserId: null,
      kind: NotificationKind.INCIDENT_REPORTED,
      notification: { id: "orphan-report" },
    });
    await delay(50);

    expect(receivedA).toEqual(["legacy-neutral"]);
    expect(receivedB).toEqual(["legacy-neutral"]);
  });
});

function warehouseUser(id: string, warehouseId: string) {
  return {
    id,
    email: `${id}@example.test`,
    role: UserRole.WAREHOUSE,
    organizationId: "org-a",
    warehouseId: warehouseId as string | null,
    warehouse: { organizationId: "org-a" } as { organizationId: string } | null,
    organization: { warehouses: [{ id: warehouseId }] },
  };
}

function adminUser(id: string, organizationId: string): ReturnType<typeof warehouseUser> {
  return {
    id,
    email: `${id}@example.test`,
    role: UserRole.ADMIN,
    organizationId,
    warehouseId: null,
    warehouse: null,
    organization: { warehouses: [] },
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
