import { BadRequestException, ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { EmailVerificationPurpose } from "@prisma/client";
import { UserRole } from "@safestock/shared-types";
import { PrismaService } from "../prisma/prisma.service";
import { EmailVerificationService } from "./email-verification.service";
import type { VerificationDelivery } from "../mail/verification-mail.service";

const PURPOSE = EmailVerificationPurpose.NOTIFICATION_EMAIL;

export interface NotificationEmailState {
  notificationEmail: string | null;
  notificationEmailVerifiedAt: Date | null;
  /** Email đang chờ nhập mã (mã chưa dùng, chưa hết hạn) — để UI hiện lại ô nhập sau khi F5. */
  pendingEmail: string | null;
  pendingExpiresAt: Date | null;
  /** Chỉ có ở ngay lần xin mã: "dev-log" = chưa cấu hình SMTP nên mã không gửi đi đâu. */
  delivery?: VerificationDelivery;
  /** Chỉ ở chế độ dev: mã trần để hiện thẳng trên giao diện. */
  devCode?: string;
}

/**
 * Thêm email cá nhân nhận cảnh báo = hai bước: xin mã → nhập mã.
 * Cột `notificationEmail` CHỈ được ghi sau khi mã đúng, nên mọi địa chỉ nằm trong DB
 * đều là hộp thư người dùng thật sự mở được — lúc có sự cố mới không gửi vào hư không.
 */
@Injectable()
export class NotificationEmailService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly verification: EmailVerificationService,
  ) {}

  async getState(userId: string): Promise<NotificationEmailState> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { notificationEmail: true, notificationEmailVerifiedAt: true },
    });
    if (!user) throw new UnauthorizedException("User không tồn tại");
    const pending = await this.verification.findPending(userId, PURPOSE);
    return {
      notificationEmail: user.notificationEmail,
      notificationEmailVerifiedAt: user.notificationEmailVerifiedAt,
      pendingEmail: pending?.email ?? null,
      pendingExpiresAt: pending?.expiresAt ?? null,
    };
  }

  /** Bước 1: sinh mã 6 số, gửi tới hộp thư, trả về thời điểm hết hạn cho UI đếm ngược. */
  async requestCode(userId: string, rawEmail: string): Promise<NotificationEmailState> {
    const email = this.verification.normalizeEmail(rawEmail);
    this.verification.assertEmailShape(email);

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { fullName: true, notificationEmail: true, notificationEmailVerifiedAt: true },
    });
    if (!user) throw new UnauthorizedException("User không tồn tại");
    if (user.notificationEmailVerifiedAt && user.notificationEmail === email) {
      throw new BadRequestException("Email này đã được xác minh cho tài khoản của bạn.");
    }

    const issued = await this.verification.issue({
      userId,
      email,
      purpose: PURPOSE,
      recipientName: user.fullName ?? null,
    });
    return {
      ...(await this.getState(userId)),
      delivery: issued.delivery,
      devCode: issued.devCode,
    };
  }

  /** Bước 2: mã đúng → ghi email + mốc xác minh vào hồ sơ. */
  async confirmCode(userId: string, code: string): Promise<NotificationEmailState> {
    const email = await this.verification.consume({ userId, code, purpose: PURPOSE });
    await this.prisma.user.update({
      where: { id: userId },
      data: { notificationEmail: email, notificationEmailVerifiedAt: new Date() },
    });
    return this.getState(userId);
  }

  /** Huỷ mã đang chờ — người dùng bấm "Nhập email khác". */
  async cancelPending(userId: string): Promise<NotificationEmailState> {
    await this.verification.cancel(userId, PURPOSE);
    return this.getState(userId);
  }

  /**
   * Gỡ email khỏi hồ sơ: không còn địa chỉ nào thì cũng không còn cảnh báo gửi tới.
   *
   * Quản trị viên KHÔNG được gỡ, chỉ được đổi sang địa chỉ khác đã xác minh. Họ là
   * người phải biết đầu tiên khi kho có sự cố; để họ tự gỡ email là mở đường cho tình
   * huống cả xã không còn ai nhận cảnh báo mà không ai nhận ra.
   */
  async remove(userId: string): Promise<NotificationEmailState> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (!user) throw new UnauthorizedException("User không tồn tại");
    if (user.role === UserRole.ADMIN) {
      throw new ForbiddenException(
        "Tài khoản quản trị bắt buộc có email nhận cảnh báo — chỉ đổi được sang địa chỉ khác, không gỡ được.",
      );
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { notificationEmail: null, notificationEmailVerifiedAt: null },
    });
    return this.cancelPending(userId);
  }
}
