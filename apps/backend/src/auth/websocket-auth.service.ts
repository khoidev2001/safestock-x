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
    if (
      !payload?.sub ||
      typeof payload.sub !== "string" ||
      !Number.isInteger(payload.sessionVersion) ||
      !payload.sid
    ) {
      throw new Error(UNAUTHORIZED_MESSAGE);
    }

    // Đọc qua dòng PHIÊN chứ không qua người dùng, cùng lý do với JwtStrategy:
    // phiên đã đăng xuất phải rớt ngay, không đợi access token tự hết hạn. Ổ cắm
    // socket còn sống lâu hơn một lượt HTTP nên chỗ này càng phải chặt.
    const session = await this.prisma.userSession.findUnique({
      where: { id: payload.sid },
      select: {
        revokedAt: true,
        user: {
          select: {
            id: true,
            email: true,
            role: true,
            organizationId: true,
            warehouseId: true,
            sessionVersion: true,
            warehouse: { select: { organizationId: true } },
            organization: { select: { warehouses: { select: { id: true } } } },
          },
        },
      },
    });
    const user = session?.user;
    if (
      !session ||
      session.revokedAt ||
      !user ||
      user.id !== payload.sub ||
      isSimulationSystemActorEmail(user.email) ||
      user.sessionVersion !== payload.sessionVersion
    ) {
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
