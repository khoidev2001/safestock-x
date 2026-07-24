import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { UserRole } from "@safestock/shared-types";
import { AuthUser } from "./authenticated-request";
import { isSimulationSystemActorEmail } from "../simulation/simulation-system-actor-identity";

export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  warehouseId?: string | null; // scope kho: null = toàn xã, có = trưởng thôn 1 kho
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
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
    return {
      userId: payload.sub,
      email: payload.email,
      role: payload.role,
      warehouseId: payload.warehouseId ?? null,
    };
  }
}
