import { BadRequestException, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import { UserRole } from "@safestock/shared-types";
import { PrismaService } from "../prisma/prisma.service";
import { JwtPayload } from "./jwt.strategy";
import { UpdateProfileDto } from "./dto";
import { isSimulationSystemActorEmail } from "../simulation/simulation-system-actor-identity";

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
  ) {}

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (
      !user ||
      isSimulationSystemActorEmail(user.email) ||
      !(await bcrypt.compare(password, user.passwordHash))
    ) {
      throw new UnauthorizedException("Email hoặc mật khẩu sai");
    }
    return this.issueTokens(user.id, user.email, user.role as UserRole, user.warehouseId);
  }

  async refresh(refreshToken: string) {
    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(refreshToken, {
        secret: this.config.get("JWT_REFRESH_SECRET"),
      });
    } catch {
      throw new UnauthorizedException("Refresh token không hợp lệ");
    }
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || isSimulationSystemActorEmail(user.email)) {
      throw new UnauthorizedException("User không tồn tại");
    }
    return this.issueTokens(user.id, user.email, user.role as UserRole, user.warehouseId);
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        phone: true,
        notificationEmail: true,
        avatarUrl: true,
        role: true,
        warehouseId: true,
        organization: { select: { name: true } },
        warehouse: { select: { name: true } },
      },
    });
    if (!user) throw new UnauthorizedException("User không tồn tại");

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      phone: user.phone,
      notificationEmail: user.notificationEmail,
      avatarUrl: user.avatarUrl,
      role: user.role as UserRole,
      warehouseId: user.warehouseId,
      unitName: user.organization.name,
      warehouseName: user.warehouse?.name ?? null,
    };
  }

  async updateProfile(userId: string, input: UpdateProfileDto) {
    if (Object.values(input).every((value) => value === undefined)) {
      throw new BadRequestException("Không có thông tin hồ sơ để cập nhật");
    }
    const fullName = input.fullName?.trim();
    if (input.fullName !== undefined && (!fullName || fullName.length < 2)) {
      throw new BadRequestException("Họ và tên phải có ít nhất 2 ký tự");
    }
    const avatarUrl = this.normalizeAvatar(input.avatarUrl);
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        fullName,
        phone: input.phone === undefined ? undefined : input.phone?.trim() || null,
        notificationEmail:
          input.notificationEmail === undefined
            ? undefined
            : input.notificationEmail?.trim().toLowerCase() || null,
        avatarUrl,
      },
    });
    return this.getProfile(userId);
  }

  private async issueTokens(
    sub: string,
    email: string,
    role: UserRole,
    warehouseId?: string | null,
  ) {
    const payload: JwtPayload = { sub, email, role, warehouseId: warehouseId ?? null };
    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(payload, {
        secret: this.config.get("JWT_ACCESS_SECRET"),
        expiresIn: "15m",
      }),
      this.jwt.signAsync(payload, {
        secret: this.config.get("JWT_REFRESH_SECRET"),
        expiresIn: "7d",
      }),
    ]);
    return { accessToken, refreshToken, user: await this.getProfile(sub) };
  }

  private normalizeAvatar(avatarUrl: string | null | undefined): string | null | undefined {
    if (avatarUrl === undefined) return undefined;
    if (!avatarUrl) return null;
    if (!/^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(avatarUrl)) {
      throw new BadRequestException("Ảnh đại diện không đúng định dạng PNG, JPEG hoặc WebP");
    }
    return avatarUrl;
  }
}
