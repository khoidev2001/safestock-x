import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { UserRole } from "@safestock/shared-types";
import { Server, Socket } from "socket.io";
import { PrismaService } from "../prisma/prisma.service";
import { JwtPayload } from "./jwt.strategy";
import { isSimulationSystemActorEmail } from "../simulation/simulation-system-actor-identity";

const UNAUTHORIZED_MESSAGE = "Unauthorized";

export interface WebSocketPrincipal {
  userId: string;
  email: string;
  role: UserRole;
  organizationId: string;
  warehouseIds: string[];
}

interface AuthenticatedSocketData {
  user?: WebSocketPrincipal;
}

@Injectable()
export class WebSocketAuthService {
  private readonly installedServers = new WeakSet<Server>();
  private readonly accessSecret: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    config: ConfigService,
  ) {
    const secret = config.get<string>("JWT_ACCESS_SECRET");
    if (!secret) throw new Error("JWT_ACCESS_SECRET is not configured");
    this.accessSecret = secret;
  }

  install(server: Server): void {
    if (this.installedServers.has(server)) return;
    this.installedServers.add(server);

    server.use(async (client, next) => {
      try {
        const data = client.data as AuthenticatedSocketData;
        data.user = await this.authenticate(client);
        next();
      } catch {
        next(new Error(UNAUTHORIZED_MESSAGE));
      }
    });
  }

  getPrincipal(client: Socket): WebSocketPrincipal | null {
    return (client.data as AuthenticatedSocketData).user ?? null;
  }

  async authenticate(client: Socket): Promise<WebSocketPrincipal> {
    const token = this.extractToken(client);
    if (!token) throw new Error(UNAUTHORIZED_MESSAGE);

    const payload = await this.jwt.verifyAsync<JwtPayload>(token, {
      secret: this.accessSecret,
      algorithms: ["HS256"],
    });
    if (!payload?.sub || typeof payload.sub !== "string") {
      throw new Error(UNAUTHORIZED_MESSAGE);
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        role: true,
        organizationId: true,
        warehouseId: true,
        warehouse: { select: { organizationId: true } },
        organization: { select: { warehouses: { select: { id: true } } } },
      },
    });
    if (!user || isSimulationSystemActorEmail(user.email)) {
      throw new Error(UNAUTHORIZED_MESSAGE);
    }
    if (user.warehouse && user.warehouse.organizationId !== user.organizationId) {
      throw new Error(UNAUTHORIZED_MESSAGE);
    }

    return {
      userId: user.id,
      email: user.email,
      role: user.role as UserRole,
      organizationId: user.organizationId,
      warehouseIds: user.warehouseId
        ? [user.warehouseId]
        : user.organization.warehouses.map((warehouse) => warehouse.id),
    };
  }

  private extractToken(client: Socket): string | null {
    const authToken = client.handshake.auth?.token;
    if (typeof authToken === "string" && authToken.trim()) return authToken.trim();

    const authorization = client.handshake.headers.authorization;
    const header = Array.isArray(authorization) ? authorization[0] : authorization;
    const match = typeof header === "string" ? /^Bearer\s+(.+)$/i.exec(header.trim()) : null;
    return match?.[1]?.trim() || null;
  }
}
