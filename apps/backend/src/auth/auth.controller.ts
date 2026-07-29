import {
  Body,
  Controller,
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
import { LoginDto, RefreshDto, UpdateProfileDto } from "./dto";
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
    await this.auth.revokeSessions(request.user.userId);
    clearRefreshCookie(response, this.secureCookies);
    return { ok: true };
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
