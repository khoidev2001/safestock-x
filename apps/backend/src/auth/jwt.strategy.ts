import { Injectable, Optional, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { UserRole } from "@safestock/shared-types";
import { AuthUser } from "./authenticated-request";
import { isSimulationSystemActorEmail } from "../simulation/simulation-system-actor-identity";
import { PrismaService } from "../prisma/prisma.service";

export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  warehouseId?: string | null; // scope kho: null = toàn xã, có = trưởng thôn 1 kho
  tokenVersion: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService, @Optional() private readonly prisma?: PrismaService) {
    const secret = config.get<string>("JWT_ACCESS_SECRET");
    if (!secret) throw new UnauthorizedException("JWT_ACCESS_SECRET chưa cấu hình");
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  // Giá trị trả về gắn vào req.user
  async validate(payload: JwtPayload): Promise<AuthUser> {
    if (isSimulationSystemActorEmail(payload.email)) {
      throw new UnauthorizedException("Actor hệ thống không được đăng nhập tương tác");
    }
    if (!Number.isInteger(payload.tokenVersion) || !this.prisma) {
      throw new UnauthorizedException("Phiên đăng nhập không còn hiệu lực");
    }
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        role: true,
        warehouseId: true,
        tokenVersion: true,
      },
    });
    if (
      !user ||
      isSimulationSystemActorEmail(user.email) ||
      user.tokenVersion !== payload.tokenVersion
    ) {
      throw new UnauthorizedException("Phiên đăng nhập không còn hiệu lực");
    }
    return {
      userId: user.id,
      email: user.email,
      role: user.role as UserRole,
      warehouseId: user.warehouseId,
    };
  }
}
