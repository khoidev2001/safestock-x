import { Body, Controller, Delete, Get, Post, Request, UseGuards } from "@nestjs/common";
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { AuthenticatedRequest } from "../auth/authenticated-request";
import { JwtAuthGuard } from "../auth/guards";
import { PrismaService } from "../prisma/prisma.service";
import { PushService } from "./push.service";

class RegisterDeviceDto {
  @IsString()
  @MinLength(10)
  @MaxLength(512)
  token!: string;

  @IsOptional()
  @IsIn(["android", "ios"])
  platform?: "android" | "ios";

  @IsOptional()
  @IsString()
  @MaxLength(120)
  deviceName?: string;
}

class UnregisterDeviceDto {
  @IsString()
  @MinLength(10)
  @MaxLength(512)
  token!: string;
}

/**
 * Đăng ký máy nhận thông báo đẩy.
 *
 * Chỉ cần đăng nhập, không đòi quyền riêng: mọi vai đều phải nhận được lệnh gửi
 * cho mình. Máy được gắn vào ĐÚNG người đang đăng nhập, lấy từ phiên chứ không
 * nhận từ thân yêu cầu — nếu không thì ai cũng đăng ký hộ máy của người khác và
 * nghe lén lệnh điều phối của họ.
 */
@UseGuards(JwtAuthGuard)
@Controller("push")
export class PushController {
  constructor(
    private readonly push: PushService,
    private readonly prisma: PrismaService,
  ) {}

  /** App hỏi trước khi xin quyền: máy chủ này có gửi được thông báo đẩy không. */
  @Get("status")
  status() {
    return { configured: this.push.isConfigured };
  }

  @Post("devices")
  async register(@Request() req: AuthenticatedRequest, @Body() dto: RegisterDeviceDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { organizationId: true },
    });
    return this.push.registerDevice({
      userId: req.user.userId,
      organizationId: user?.organizationId ?? "",
      token: dto.token,
      platform: dto.platform,
      deviceName: dto.deviceName ?? null,
    });
  }

  /** Gọi lúc đăng xuất, để máy vừa trả lại không còn nghe chuông của người cũ. */
  @Delete("devices")
  async unregister(@Body() dto: UnregisterDeviceDto) {
    await this.push.removeDevice(dto.token);
    return { removed: true };
  }
}
