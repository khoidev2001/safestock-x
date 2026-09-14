import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Optional,
  UnauthorizedException,
} from "@nestjs/common";
import { EmailVerificationPurpose, type User } from "@prisma/client";
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
import { EmailVerificationService } from "./email-verification.service";
import {
  IpWindowQuota,
  LOGIN_CHALLENGE_TTL_SECONDS,
  LOGIN_CHALLENGE_TYPE,
  maskEmail,
  requiresLoginOtp,
  type LoginChallengePayload,
  type LoginOtpChallenge,
} from "./login-otp";

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
    @Optional() private readonly rateLimit?: AuthRateLimitService,
    @Optional() private readonly verification?: EmailVerificationService,
  ) {}

  /** Tối đa 30 lượt nhập mã / 15 phút mỗi IP — xem `IpWindowQuota`. */
  private readonly otpVerifyQuota = new IpWindowQuota(30, 15 * 60_000);
  /** Tối đa 10 lượt xin gửi lại mã / 15 phút mỗi IP. */
  private readonly otpResendQuota = new IpWindowQuota(10, 15 * 60_000);

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
    // Tài khoản quản trị: đúng mật khẩu CHƯA đủ, phải qua bước mã gửi tới email.
    // Không cấp phiên nào ở bước này — phiên chỉ sinh ra sau khi mã đúng.
    if (requiresLoginOtp(user)) return this.startLoginOtp(user);
    return this.openSession(user);
  }

  /**
   * Bước hai của đăng nhập quản trị: mã đúng thì mở phiên như đăng nhập thường.
   *
   * Mã sai / hết hạn / sai quá số lần: `EmailVerificationService.consume` ném đúng câu
   * cho từng trường hợp. Riêng mã hết hạn thì câu là "Mã đã hết hạn. Vui lòng gửi lại
   * mã mới." để người dùng biết phải bấm gửi lại chứ không phải gõ lại.
   */
  async verifyLoginOtp(challengeToken: string, code: string, sourceIp = "unknown") {
    this.assertOtpQuota(this.otpVerifyQuota, sourceIp);
    const user = await this.userFromChallenge(challengeToken);
    await this.requireVerification().consume({
      userId: user.id,
      code,
      purpose: EmailVerificationPurpose.LOGIN_OTP,
      // Email xác minh đổi giữa chừng thì mã cũ nằm ở hộp thư không còn là của tài
      // khoản này — không được dùng.
      expectedEmail: user.notificationEmail ?? undefined,
    });
    return this.openSession(user);
  }

  /** Xin mã mới. Chưa đủ 60 giây kể từ mã trước thì bị từ chối kèm số giây phải chờ. */
  async resendLoginOtp(challengeToken: string, sourceIp = "unknown"): Promise<LoginOtpChallenge> {
    this.assertOtpQuota(this.otpResendQuota, sourceIp);
    const user = await this.userFromChallenge(challengeToken);
    return this.sendLoginOtp(user, challengeToken);
  }

  /**
   * Bắt đầu bước mã.
   *
   * Bấm "Đăng nhập" lại khi mã cũ còn hạn thì DÙNG LẠI mã đó, không gửi thư mới: người
   * dùng quay lại màn trước rồi đăng nhập lần nữa là chuyện thường, và gửi thư mới mỗi
   * lần như thế vừa làm đầy hộp thư vừa đốt oan hạn mức chống spam của chính họ.
   */
  private async startLoginOtp(user: User): Promise<LoginOtpChallenge> {
    const verification = this.requireVerification();
    if (!user.notificationEmail || !user.notificationEmailVerifiedAt) {
      throw new ForbiddenException(
        "Tài khoản quản trị chưa có email đã xác minh nên chưa nhận được mã đăng nhập. Hãy liên hệ quản trị cấp cao.",
      );
    }
    const challengeToken = await this.signChallenge(user);
    const pending = await verification.findPending(user.id, EmailVerificationPurpose.LOGIN_OTP);
    if (pending) {
      return {
        otpRequired: true,
        challengeToken,
        email: maskEmail(pending.email),
        expiresAt: pending.expiresAt.toISOString(),
        resendAvailableAt: pending.resendAvailableAt.toISOString(),
      };
    }
    return this.sendLoginOtp(user, challengeToken);
  }

  private async sendLoginOtp(user: User, challengeToken: string): Promise<LoginOtpChallenge> {
    if (!user.notificationEmail || !user.notificationEmailVerifiedAt) {
      throw new ForbiddenException(
        "Tài khoản quản trị chưa có email đã xác minh nên chưa nhận được mã đăng nhập.",
      );
    }
    const issued = await this.requireVerification().issue({
      userId: user.id,
      email: user.notificationEmail,
      purpose: EmailVerificationPurpose.LOGIN_OTP,
      recipientName: user.fullName,
    });
    return {
      otpRequired: true,
      challengeToken,
      email: maskEmail(issued.email),
      expiresAt: issued.expiresAt.toISOString(),
      resendAvailableAt: issued.resendAvailableAt.toISOString(),
      ...(issued.devCode ? { devCode: issued.devCode } : {}),
    };
  }

  private signChallenge(user: User): Promise<string> {
    const payload: LoginChallengePayload = {
      sub: user.id,
      typ: LOGIN_CHALLENGE_TYPE,
      sv: user.sessionVersion,
    };
    return this.jwt.signAsync(payload, {
      secret: this.challengeSecret(),
      expiresIn: LOGIN_CHALLENGE_TTL_SECONDS,
    });
  }

  private async userFromChallenge(challengeToken: string): Promise<User> {
    let payload: LoginChallengePayload;
    try {
      payload = await this.jwt.verifyAsync<LoginChallengePayload>(String(challengeToken ?? ""), {
        secret: this.challengeSecret(),
      });
    } catch {
      throw new UnauthorizedException("Phiên đăng nhập đã hết hạn. Vui lòng nhập lại mật khẩu.");
    }
    if (payload.typ !== LOGIN_CHALLENGE_TYPE || !payload.sub) {
      throw new UnauthorizedException("Phiên đăng nhập không hợp lệ. Vui lòng nhập lại mật khẩu.");
    }
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || user.sessionVersion !== payload.sv || !requiresLoginOtp(user)) {
      throw new UnauthorizedException("Phiên đăng nhập không còn hiệu lực. Vui lòng nhập lại mật khẩu.");
    }
    return user;
  }

  /**
   * Khoá ký riêng cho thẻ thử thách, suy từ khoá access.
   *
   * Không dùng thẳng khoá access: thẻ thử thách và access token cùng là JWT, dùng
   * chung khoá thì một access token bị lộ cũng qua được bước kiểm chữ ký của thẻ
   * thử thách (dù `typ` vẫn chặn). Tách khoá là bỏ hẳn đường đó.
   */
  private challengeSecret(): string {
    return `${this.config.get<string>("JWT_ACCESS_SECRET") ?? ""}:login-otp-challenge`;
  }

  private requireVerification(): EmailVerificationService {
    // Thiếu dịch vụ gửi mã thì CHẶN đăng nhập quản trị, tuyệt đối không cho đi tắt
    // qua bước mã — lỗi cấu hình không được biến thành lỗ hổng.
    if (!this.verification) {
      throw new HttpException(
        "Chưa gửi được mã đăng nhập. Vui lòng thử lại sau.",
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    return this.verification;
  }

  private assertOtpQuota(quota: IpWindowQuota, sourceIp: string): void {
    const wait = quota.take(sourceIp);
    if (wait > 0) {
      throw new HttpException(
        `Thao tác quá nhiều lần. Vui lòng thử lại sau ${Math.ceil(wait / 60)} phút.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async openSession(user: User) {
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
