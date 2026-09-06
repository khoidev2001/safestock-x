import { BadRequestException, Injectable, Optional, UnauthorizedException } from "@nestjs/common";
import { communeNameFromUnitName } from "./commune-name";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import { UserRole } from "@safestock/shared-types";
import { PrismaService } from "../prisma/prisma.service";
import { JwtPayload } from "./jwt.strategy";
import { UpdateProfileDto } from "./dto";
import { isSimulationSystemActorEmail } from "../simulation/simulation-system-actor-identity";
import { AuthRateLimitService } from "./auth-rate-limit.service";
import { normalizeLoginEmail } from "./login-email";

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
    @Optional() private readonly rateLimit?: AuthRateLimitService,
  ) {}

  async login(email: string, password: string, sourceIp = "unknown") {
    const normalizedEmail = normalizeLoginEmail(email);
    this.rateLimit?.assertAllowed(normalizedEmail, sourceIp);
    const user = await this.prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (
      !user ||
      isSimulationSystemActorEmail(user.email) ||
      !(await bcrypt.compare(password, user.passwordHash))
    ) {
      const state = this.rateLimit?.recordFailure(normalizedEmail, sourceIp);
      // Vừa chạm ngưỡng khoá: nói thẳng là đã khoá, thay vì lại báo "sai mật
      // khẩu" rồi lần bấm kế tiếp mới hiện ra khoá — người dùng sẽ tưởng mình
      // gõ sai lần nữa chứ không biết chuyện gì vừa xảy ra.
      if (state?.blocked) {
        this.rateLimit?.assertAllowed(normalizedEmail, sourceIp);
      }
      throw new UnauthorizedException(
        state?.shouldWarn
          ? `Sai tên đăng nhập hoặc mật khẩu. Còn ${state.remaining} lần thử trước khi tài khoản bị tạm khoá.`
          : "Sai tên đăng nhập hoặc mật khẩu.",
      );
    }
    this.rateLimit?.clear(normalizedEmail, sourceIp);
    /*
      Đăng nhập MỞ THÊM một phiên, không thu hồi phiên nào đang có.
      
      Trước đây bước này tăng cả `tokenVersion` lẫn `sessionVersion` của người
      dùng, nên đăng nhập trên web đá văng điện thoại ra ngay lập tức: access
      token của điện thoại mang `sessionVersion` cũ nên lượt gọi kế tiếp bị chối,
      còn refresh token của nó cũng thành cũ nên không gia hạn lại được. Cùng một
      người, cùng một tài khoản, hai thiết bị — không có lý do nào để cái này
      đuổi cái kia.
      
      Thu hồi thật vẫn còn nguyên đường của nó: `revokeSessions` cho đổi mật khẩu
      và đổi quyền.
    */
    const session = await this.prisma.userSession.create({
      data: { userId: user.id },
      select: { id: true, tokenVersion: true },
    });
    return this.issueTokens(
      user.id,
      user.email,
      user.role as UserRole,
      user.warehouseId,
      session.tokenVersion,
      user.sessionVersion,
      session.id,
    );
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
    if (!Number.isInteger(payload.tokenVersion) || !payload.sid) {
      throw new UnauthorizedException("Refresh token không còn hiệu lực");
    }
    const session = await this.prisma.userSession.findUnique({
      where: { id: payload.sid },
      include: { user: true },
    });
    const user = session?.user;
    if (
      !session ||
      session.revokedAt ||
      !user ||
      user.id !== payload.sub ||
      isSimulationSystemActorEmail(user.email) ||
      session.tokenVersion !== payload.tokenVersion ||
      // Thu hồi toàn bộ (đổi mật khẩu, đổi quyền) phải chặn được cả đường gia
      // hạn, nếu không thì refresh token vẫn đẻ ra access token mới suốt 7 ngày.
      user.sessionVersion !== payload.sessionVersion
    ) {
      throw new UnauthorizedException("Refresh token không còn hiệu lực");
    }
    /*
      Xoay số của RIÊNG phiên này, có chốt lạc quan để một refresh token chỉ dùng
      được đúng một lần — dùng lại lần hai thì `count` ra 0 và bị chối.
      
      Trước đây chốt này đặt trên `User`, tức hai thiết bị chung một bộ đếm: web
      gia hạn xong là refresh token của điện thoại thành cũ, mà nó có làm gì sai
      đâu. Bộ đếm theo phiên giữ nguyên tính chất chống dùng lại, chỉ thu phạm vi
      lại đúng bằng cái thiết bị đang xoay.
    */
    const rotated = await this.prisma.userSession.updateMany({
      where: { id: session.id, tokenVersion: payload.tokenVersion, revokedAt: null },
      data: { tokenVersion: { increment: 1 }, lastUsedAt: new Date() },
    });
    if (rotated.count !== 1) {
      throw new UnauthorizedException("Refresh token không còn hiệu lực");
    }
    // sessionVersion KHÔNG tăng ở đây: gia hạn phiên không phải là thu hồi phiên.
    // Nhờ vậy các tab/thiết bị khác đang cầm access token cũ vẫn dùng tiếp được
    // cho tới khi token của chính nó hết hạn.
    return this.issueTokens(
      user.id,
      user.email,
      user.role as UserRole,
      user.warehouseId,
      payload.tokenVersion + 1,
      user.sessionVersion,
      session.id,
    );
  }

  /**
   * Thoát khỏi MỘT thiết bị — đúng cái vừa bấm nút, không đụng thiết bị khác.
   *
   * Đây là điều người dùng mong đợi khi bấm "Đăng xuất" trên máy tính chung ở
   * trụ sở: máy đó thoát ra, còn điện thoại đang cầm trong tay thì không.
   */
  async revokeSession(sessionId: string): Promise<void> {
    await this.prisma.userSession.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Thu hồi TẤT CẢ: đổi mật khẩu, đổi quyền, hoặc chủ động thoát khỏi mọi nơi.
   *
   * Tăng `sessionVersion` cắt mọi access token đang chạy ngay lập tức; đánh dấu
   * mọi phiên đã thu hồi thì không refresh token nào đẻ thêm được token mới.
   */
  async revokeSessions(userId: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { sessionVersion: { increment: 1 } },
      }),
      this.prisma.userSession.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
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
        notificationEmailVerifiedAt: true,
        avatarUrl: true,
        role: true,
        isSuperAdmin: true,
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
      notificationEmailVerifiedAt: user.notificationEmailVerifiedAt,
      avatarUrl: user.avatarUrl,
      role: user.role as UserRole,
      // Super admin vẫn là ADMIN ở mọi nơi khác; cờ này chỉ mở thêm phần quản trị tài khoản.
      isSuperAdmin: user.isSuperAdmin,
      warehouseId: user.warehouseId,
      unitName: user.organization.name,
      // Tên xã trần, để giao diện ghi "Nhiệm vụ của xã Đồng Xuân" thay vì đọc
      // nguyên "Hội Chữ thập đỏ xã Đồng Xuân". Rút ở đây chứ không ở web: một xã
      // đổi tên đơn vị thì chỉ có một chỗ phải đúng.
      communeName: communeNameFromUnitName(user.organization.name) ?? null,
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
        // notificationEmail cố tình KHÔNG nằm ở đây: đổi email nhận cảnh báo phải đi
        // qua luồng xác minh mã 6 số, không thì lại có địa chỉ gõ sai nằm trong DB.
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
    tokenVersion = 0,
    sessionVersion = 0,
    sid = "",
  ) {
    const payload: JwtPayload = {
      sub,
      email,
      role,
      warehouseId: warehouseId ?? null,
      tokenVersion,
      sessionVersion,
      sid,
    };
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
