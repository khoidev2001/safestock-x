import { Injectable, Optional, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { UserRole } from "@safestock/shared-types";
import { PrismaService } from "../prisma/prisma.service";
import { isSimulationSystemActorEmail } from "../simulation/simulation-system-actor-identity";
import { AuthUser } from "./authenticated-request";

export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  warehouseId?: string | null; // Claim cũ; phân quyền dùng User hiện tại trong DB.
}

const WAREHOUSE_SCOPED_ROLES = new Set<UserRole>([
  UserRole.WAREHOUSE,
  UserRole.REPORTER,
]);

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    @Optional() private readonly prisma?: PrismaService,
  ) {
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
    if (!payload?.sub || typeof payload.sub !== "string") {
      throw new UnauthorizedException("Token không có danh tính hợp lệ");
    }
    if (!this.prisma) {
      throw new UnauthorizedException("Không thể xác minh danh tính hiện tại");
    }

    let user: {
      id: string;
      email: string;
      role: string;
      organizationId: string;
      warehouseId: string | null;
      warehouse: { organizationId: string } | null;
    } | null;
    try {
      user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: {
          id: true,
          email: true,
          role: true,
          organizationId: true,
          warehouseId: true,
          warehouse: { select: { organizationId: true } },
        },
      });
    } catch {
      throw new UnauthorizedException("Không thể xác minh danh tính hiện tại");
    }
    if (!user || isSimulationSystemActorEmail(user.email)) {
      throw new UnauthorizedException("User không tồn tại hoặc không được phép đăng nhập");
    }

    if (!Object.values(UserRole).includes(user.role as UserRole)) {
      throw new UnauthorizedException("Vai trò hiện tại của user không hợp lệ");
    }
    const role = user.role as UserRole;
    const requiresWarehouse = WAREHOUSE_SCOPED_ROLES.has(role);
    if (
      requiresWarehouse &&
      (!user.warehouseId ||
        !user.warehouse ||
        user.warehouse.organizationId !== user.organizationId)
    ) {
      throw new UnauthorizedException("Phạm vi kho của user không hợp lệ");
    }

    return {
      userId: user.id,
      email: user.email,
      role,
      organizationId: user.organizationId,
      warehouseId: requiresWarehouse ? user.warehouseId : null,
    };
  }
}
