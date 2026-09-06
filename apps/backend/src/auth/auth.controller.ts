import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Patch,
  Post,
  Request,
  Res,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request as ExpressRequest, Response } from "express";
import { AuthService } from "./auth.service";
import { AuthenticatedRequest } from "./authenticated-request";
import {
  ConfirmNotificationEmailDto,
  ConfirmPasswordResetDto,
  ConfirmPhoneVerificationDto,
  LoginDto,
  RefreshDto,
  RequestNotificationEmailDto,
  RequestPasswordResetDto,
  RequestPhoneVerificationDto,
  UpdateProfileDto,
} from "./dto";
import { NotificationEmailService } from "./notification-email.service";
import { PasswordResetService } from "./password-reset.service";
import { PhoneVerificationService } from "./phone-verification.service";
import { JwtAuthGuard } from "./guards";
import { getAuthSourceIp } from "./auth-request";
import {
  clearRefreshCookie,
  isWebSessionTransport,
  readRefreshCookie,
  setRefreshCookie,
  useSecureAuthCookie,
} from "./auth-cookie";

@Controller("auth")
export class AuthController {
  constructor(
    private auth: AuthService,
    private config: ConfigService,
    private notificationEmail: NotificationEmailService,
    private passwordReset: PasswordResetService,
    private phoneVerification: PhoneVerificationService,
  ) {}

  @Post("login")
  async login(
    @Request() request: ExpressRequest,
    @Headers("x-session-transport") sessionTransport: string | undefined,
    @Res({ passthrough: true }) response: Response,
    @Body() dto: LoginDto,
  ) {
    const session = await this.auth.login(dto.email, dto.password, getAuthSourceIp(request));
    return this.respondWithSession(response, sessionTransport, session);
  }

  @Post("refresh")
  async refresh(
    @Request() request: ExpressRequest,
    @Headers("x-session-transport") sessionTransport: string | undefined,
    @Res({ passthrough: true }) response: Response,
    @Body() dto: RefreshDto,
  ) {
    const webSession = isWebSessionTransport(sessionTransport);
    const refreshToken = webSession ? readRefreshCookie(request) : dto.refreshToken;
    if (!refreshToken) throw new UnauthorizedException("Refresh token không hợp lệ");

    const session = await this.auth.refresh(refreshToken);
    return this.respondWithSession(response, sessionTransport, session);
  }

  @UseGuards(JwtAuthGuard)
  @Post("logout")
  async logout(
    @Request() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    // Thoát khỏi ĐÚNG thiết bị này. Trước đây bước này thu hồi mọi phiên của
    // người dùng, nên đăng xuất trên máy trực ban cũng đá luôn điện thoại đang
    // ở ngoài hiện trường ra ngoài.
    await this.auth.revokeSession(request.user.sessionId);
    clearRefreshCookie(response, this.secureCookies);
    return { ok: true };
  }

  /**
   * Quên mật khẩu, bước 1 — CÔNG KHAI (người dùng đang không đăng nhập được).
   * Luôn trả cùng một câu dù tài khoản có thật hay không, để không thành công cụ dò tên.
   */
  @Post("password-reset/request")
  requestPasswordReset(
    @Request() request: ExpressRequest,
    @Body() dto: RequestPasswordResetDto,
  ) {
    return this.passwordReset.requestCode(dto.login, getAuthSourceIp(request));
  }

  /** Quên mật khẩu, bước 2 — CÔNG KHAI: mã đúng thì đặt mật khẩu mới. */
  @Post("password-reset/confirm")
  confirmPasswordReset(@Body() dto: ConfirmPasswordResetDto) {
    return this.passwordReset.resetPassword({
      login: dto.login,
      code: dto.code,
      password: dto.password,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Get("me")
  me(@Request() req: AuthenticatedRequest) {
    return this.auth.getProfile(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch("me")
  updateMe(@Request() req: AuthenticatedRequest, @Body() dto: UpdateProfileDto) {
    return this.auth.updateProfile(req.user.userId, dto);
  }

  /** Trạng thái số điện thoại: số đang có, và mã nào đang chờ nhập. */
  @UseGuards(JwtAuthGuard)
  @Get("me/phone")
  phoneState(@Request() req: AuthenticatedRequest) {
    return this.phoneVerification.getState(req.user.userId);
  }

  /** Bước 1: nhắn mã 6 số tới số vừa nhập. Chưa ghi gì vào hồ sơ ở bước này. */
  @UseGuards(JwtAuthGuard)
  @Post("me/phone")
  requestPhoneCode(
    @Request() req: AuthenticatedRequest,
    @Body() dto: RequestPhoneVerificationDto,
  ) {
    return this.phoneVerification.requestCode(req.user.userId, dto.phone);
  }

  /** Bước 2: mã đúng thì số mới được gắn vào hồ sơ. */
  @UseGuards(JwtAuthGuard)
  @Post("me/phone/verify")
  confirmPhoneCode(
    @Request() req: AuthenticatedRequest,
    @Body() dto: ConfirmPhoneVerificationDto,
  ) {
    return this.phoneVerification.confirmCode(req.user.userId, dto.code);
  }

  /** Huỷ mã đang chờ để nhập số khác. */
  @UseGuards(JwtAuthGuard)
  @Delete("me/phone/pending")
  cancelPhoneCode(@Request() req: AuthenticatedRequest) {
    return this.phoneVerification.cancelPending(req.user.userId);
  }

  /** Gỡ số khỏi hồ sơ. */
  @UseGuards(JwtAuthGuard)
  @Delete("me/phone")
  removePhone(@Request() req: AuthenticatedRequest) {
    return this.phoneVerification.remove(req.user.userId);
  }

  /** Trạng thái email cảnh báo: đã xác minh chưa, có mã nào đang chờ nhập không. */
  @UseGuards(JwtAuthGuard)
  @Get("me/notification-email")
  notificationEmailState(@Request() req: AuthenticatedRequest) {
    return this.notificationEmail.getState(req.user.userId);
  }

  /** Bước 1: gửi mã 6 số tới email vừa nhập. Chưa ghi gì vào hồ sơ ở bước này. */
  @UseGuards(JwtAuthGuard)
  @Post("me/notification-email")
  requestNotificationEmail(
    @Request() req: AuthenticatedRequest,
    @Body() dto: RequestNotificationEmailDto,
  ) {
    return this.notificationEmail.requestCode(req.user.userId, dto.email);
  }

  /** Bước 2: mã đúng thì email mới được gắn vào hồ sơ. */
  @UseGuards(JwtAuthGuard)
  @Post("me/notification-email/verify")
  confirmNotificationEmail(
    @Request() req: AuthenticatedRequest,
    @Body() dto: ConfirmNotificationEmailDto,
  ) {
    return this.notificationEmail.confirmCode(req.user.userId, dto.code);
  }

  /** Huỷ mã đang chờ để nhập lại địa chỉ khác. */
  @UseGuards(JwtAuthGuard)
  @Delete("me/notification-email/pending")
  cancelNotificationEmail(@Request() req: AuthenticatedRequest) {
    return this.notificationEmail.cancelPending(req.user.userId);
  }

  /** Gỡ email khỏi hồ sơ. */
  @UseGuards(JwtAuthGuard)
  @Delete("me/notification-email")
  removeNotificationEmail(@Request() req: AuthenticatedRequest) {
    return this.notificationEmail.remove(req.user.userId);
  }

  private respondWithSession(
    response: Response,
    sessionTransport: string | undefined,
    session: Awaited<ReturnType<AuthService["login"]>>,
  ) {
    if (!isWebSessionTransport(sessionTransport)) return session;
    setRefreshCookie(response, session.refreshToken, this.secureCookies);
    return { accessToken: session.accessToken, user: session.user };
  }

  private get secureCookies(): boolean {
    return useSecureAuthCookie(this.config.get<string>("AUTH_COOKIE_SECURE"));
  }
}
