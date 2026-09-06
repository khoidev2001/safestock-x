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
  /** Số thứ tự refresh token — chỉ luồng gia hạn phiên đọc tới. */
  tokenVersion: number;
  /** Số thứ tự phiên — đòn bẩy thu hồi TẤT CẢ thiết bị cùng lúc. */
  sessionVersion: number;
  /** Phiên nào của người này — mỗi thiết bị một phiên, thu hồi được riêng lẻ. */
  sid: string;
}

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
    if (isSimulationSystemActorEmail(payload.email)) {
      throw new UnauthorizedException("Actor hệ thống không được đăng nhập tương tác");
    }
    // Token phát trước khi có phiên theo thiết bị không mang `sid`, nên không
    // tra được nó thuộc phiên nào để biết đã bị thu hồi hay chưa. Chối một lần,
    // người dùng đăng nhập lại là xong — thà thế còn hơn để một token không thu
    // hồi được chạy tiếp bảy ngày.
    if (!Number.isInteger(payload.sessionVersion) || !payload.sid || !this.prisma) {
      throw new UnauthorizedException("Phiên đăng nhập không còn hiệu lực");
    }
    // Một lượt đọc thay vì hai: dòng phiên đã kéo theo người dùng của nó.
    const session = await this.prisma.userSession.findUnique({
      where: { id: payload.sid },
      select: {
        revokedAt: true,
        user: {
          select: {
            id: true,
            email: true,
            role: true,
            warehouseId: true,
            sessionVersion: true,
          },
        },
      },
    });
    const user = session?.user;
    // So với sessionVersion, KHÔNG so với tokenVersion: tokenVersion nhảy mỗi lượt
    // gia hạn phiên, mà một lượt gia hạn ở tab này không được phép đá tab kia ra.
    //
    // Thêm một điều kiện nữa so với trước: phiên này còn sống. Thiếu nó thì bấm
    // đăng xuất trên một máy vẫn để access token của chính máy đó chạy tiếp tới
    // 15 phút.
    if (
      !session ||
      session.revokedAt ||
      !user ||
      user.id !== payload.sub ||
      isSimulationSystemActorEmail(user.email) ||
      user.sessionVersion !== payload.sessionVersion
    ) {
      throw new UnauthorizedException("Phiên đăng nhập không còn hiệu lực");
    }
    return {
      userId: user.id,
      email: user.email,
      role: user.role as UserRole,
      warehouseId: user.warehouseId,
      sessionId: payload.sid,
    };
  }
}
