import { Body, Controller, Get, Patch, Post, UseGuards, Request } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { AuthenticatedRequest } from "./authenticated-request";
import { LoginDto, RefreshDto, UpdateProfileDto } from "./dto";
import { JwtAuthGuard } from "./guards";

@Controller("auth")
export class AuthController {
  constructor(private auth: AuthService) {}

  @Post("login")
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.email, dto.password);
  }

  @Post("refresh")
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
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
}
