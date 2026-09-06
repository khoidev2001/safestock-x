import { randomInt } from "crypto";
import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { EmailVerificationPurpose } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../prisma/prisma.service";
import {
  VerificationMailService,
  type VerificationDelivery,
} from "../mail/verification-mail.service";

/** Mã sống 10 phút — đủ để mở hộp thư, ngắn đủ để mã lọt ra ngoài cũng vô dụng nhanh. */
export const CODE_TTL_MS = 10 * 60_000;
/** Sai quá 5 lần thì mã chết, buộc gửi lại — chặn dò 6 số bằng vét cạn. */
export const MAX_ATTEMPTS = 5;
/** Chống spam hộp thư người khác: tối đa 5 mã / 30 phút và cách nhau ít nhất 60 giây. */
export const RESEND_COOLDOWN_MS = 60_000;
export const REQUEST_WINDOW_MS = 30 * 60_000;
export const MAX_REQUESTS_PER_WINDOW = 5;

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export interface PendingVerification {
  email: string;
  expiresAt: Date;
}

export interface IssuedVerification extends PendingVerification {
  /** "dev-log" = chưa cấu hình SMTP, mã không tới hộp thư nào cả. */
  delivery: VerificationDelivery;
  /**
   * CHỈ có ở chế độ dev: mã trần, để giao diện hiện thẳng ra cho người đang thử.
   * Chưa cấu hình SMTP thì mã chẳng đi đâu, bắt người ta mò log máy chủ là vô ích.
   * Gửi được mail thật (delivery = "smtp") thì trường này luôn undefined — mã chỉ
   * nằm trong hộp thư người nhận, đúng như tính năng cam kết.
   */
  devCode?: string;
}

/**
 * Lõi dùng chung của mọi luồng "gửi mã 6 số tới email rồi bắt nhập lại".
 * `purpose` tách các luồng ra: mã xin để đổi email cảnh báo của chính mình KHÔNG
 * dùng được để tạo tài khoản ADMIN, và ngược lại. Hạn mức gửi cũng đếm riêng theo
 * từng purpose để luồng này không khoá luồng kia.
 */
@Injectable()
export class EmailVerificationService {
  private readonly log = new Logger(EmailVerificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: VerificationMailService,
  ) {}

  isMailConfigured(): boolean {
    return this.mail.isConfigured();
  }

  normalizeEmail(email: string): string {
    return String(email ?? "")
      .trim()
      .toLowerCase();
  }

  assertEmailShape(email: string): void {
    if (!EMAIL_PATTERN.test(email) || email.length > 254) {
      throw new BadRequestException("Email chưa đúng định dạng.");
    }
  }

  /** Sinh mã, lưu hash, gửi mail. Gửi hỏng → xoá mã vừa tạo rồi ném lỗi. */
  async issue(input: {
    userId: string;
    email: string;
    purpose: EmailVerificationPurpose;
    recipientName: string | null;
  }): Promise<IssuedVerification> {
    const email = this.normalizeEmail(input.email);
    this.assertEmailShape(email);
    if (!this.mail.canSend()) {
      throw new ServiceUnavailableException(
        "Máy chủ email chưa được cấu hình nên chưa gửi được mã xác minh.",
      );
    }

    const now = new Date();
    await this.assertRequestQuota(input.userId, input.purpose, now);

    const code = generateCode();
    const codeHash = await bcrypt.hash(code, 10);
    // Mã cũ chết ngay khi có mã mới: người dùng gõ mã trong email cũ sẽ bị từ chối
    // thay vì xác minh trúng một địa chỉ họ vừa gõ lại cho khác đi.
    await this.cancel(input.userId, input.purpose, now);
    const record = await this.prisma.emailVerification.create({
      data: {
        userId: input.userId,
        email,
        purpose: input.purpose,
        codeHash,
        expiresAt: new Date(now.getTime() + CODE_TTL_MS),
      },
      select: { id: true, email: true, expiresAt: true },
    });

    let delivery: VerificationDelivery;
    try {
      delivery = await this.mail.sendVerificationCode({
        email,
        code,
        fullName: input.recipientName,
        expiresInMinutes: Math.round(CODE_TTL_MS / 60_000),
        // Nội dung thư đổi theo việc đang làm: xác minh email cảnh báo, liên kết tài
        // khoản quản trị mới, hay đặt lại mật khẩu — ba việc, ba cách nói khác nhau.
        purpose: input.purpose,
      });
    } catch (error) {
      // Gửi hỏng mà vẫn giữ mã thì người dùng ngồi chờ một mã không bao giờ tới,
      // và hạn mức bị đốt oan. Xoá mã rồi báo lỗi thật.
      try {
        await this.prisma.emailVerification.delete({ where: { id: record.id } });
      } catch {
        // Mã tự hết hạn sau CODE_TTL_MS, xoá không được cũng không kẹt luồng.
      }
      this.log.warn(`Không gửi được mã xác minh: ${(error as Error).message}`);
      throw new ServiceUnavailableException(
        "Chưa gửi được mã xác minh tới email này. Kiểm tra lại địa chỉ rồi thử lại.",
      );
    }

    return {
      email: record.email,
      expiresAt: record.expiresAt,
      delivery,
      devCode: delivery === "dev-log" ? code : undefined,
    };
  }

  /** Mã đang chờ nhập (chưa dùng, chưa hết hạn) — để UI dựng lại màn nhập mã sau khi F5. */
  async findPending(
    userId: string,
    purpose: EmailVerificationPurpose,
    now = new Date(),
  ): Promise<PendingVerification | null> {
    const pending = await this.findActive(userId, purpose, now);
    return pending ? { email: pending.email, expiresAt: pending.expiresAt } : null;
  }

  /**
   * Mã đúng → tiêu mã và trả về email đã xác minh. `expectedEmail` để caller chốt
   * rằng mã đang xác minh đúng địa chỉ hiện trên form, không phải địa chỉ gõ lúc trước.
   */
  async consume(input: {
    userId: string;
    code: string;
    purpose: EmailVerificationPurpose;
    expectedEmail?: string;
  }): Promise<string> {
    const code = String(input.code ?? "").trim();
    if (!/^\d{6}$/.test(code)) throw new BadRequestException("Mã xác minh gồm 6 chữ số.");

    const now = new Date();
    const pending = await this.findActive(input.userId, input.purpose, now);
    if (!pending) {
      throw new BadRequestException("Mã đã hết hạn hoặc chưa được yêu cầu. Hãy gửi lại mã.");
    }
    if (input.expectedEmail && this.normalizeEmail(input.expectedEmail) !== pending.email) {
      throw new BadRequestException(
        `Mã đang chờ là của ${pending.email}. Hãy gửi mã mới cho địa chỉ vừa nhập.`,
      );
    }
    if (pending.attempts >= MAX_ATTEMPTS) {
      await this.markConsumed(pending.id, now);
      throw new BadRequestException("Nhập sai quá nhiều lần. Hãy gửi lại mã mới.");
    }

    if (!(await bcrypt.compare(code, pending.codeHash))) {
      const attempts = pending.attempts + 1;
      await this.prisma.emailVerification.update({
        where: { id: pending.id },
        data: { attempts },
      });
      const remaining = MAX_ATTEMPTS - attempts;
      throw new BadRequestException(
        remaining > 0
          ? `Mã không đúng. Còn ${remaining} lần thử.`
          : "Mã không đúng. Hãy gửi lại mã mới.",
      );
    }

    await this.prisma.emailVerification.update({
      where: { id: pending.id },
      data: { consumedAt: now, verifiedAt: now },
    });
    return pending.email;
  }

  /** Huỷ mọi mã đang chờ của một luồng. */
  async cancel(
    userId: string,
    purpose: EmailVerificationPurpose,
    now = new Date(),
  ): Promise<void> {
    await this.prisma.emailVerification.updateMany({
      where: { userId, purpose, consumedAt: null },
      data: { consumedAt: now },
    });
  }

  private async assertRequestQuota(
    userId: string,
    purpose: EmailVerificationPurpose,
    now: Date,
  ): Promise<void> {
    const since = new Date(now.getTime() - REQUEST_WINDOW_MS);
    // Mã đã xác minh xong KHÔNG tính vào hạn mức: super admin lập liên tiếp mấy tài
    // khoản quản trị là việc bình thường, chặn họ ở tài khoản thứ năm là chặn nhầm.
    // Cái cần chặn là mã gửi đi rồi bỏ đó — dấu hiệu đang bơm thư vào hộp người khác.
    const recent = await this.prisma.emailVerification.findMany({
      where: { userId, purpose, verifiedAt: null, createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    const last = recent[0];
    if (last && now.getTime() - last.createdAt.getTime() < RESEND_COOLDOWN_MS) {
      const wait = Math.ceil(
        (RESEND_COOLDOWN_MS - (now.getTime() - last.createdAt.getTime())) / 1000,
      );
      throw new BadRequestException(`Vui lòng đợi ${wait} giây trước khi gửi lại mã.`);
    }
    if (recent.length >= MAX_REQUESTS_PER_WINDOW) {
      // Nói đúng số phút phải chờ: mốc mở khoá là lúc mã cũ nhất rơi khỏi cửa sổ.
      const oldest = recent[recent.length - 1].createdAt;
      const minutes = Math.max(
        1,
        Math.ceil((oldest.getTime() + REQUEST_WINDOW_MS - now.getTime()) / 60_000),
      );
      throw new BadRequestException(
        `Đã gửi ${recent.length} mã chưa dùng tới trong ${Math.round(REQUEST_WINDOW_MS / 60_000)} phút qua. ` +
          `Hãy nhập mã đã nhận, hoặc đợi ${minutes} phút nữa rồi gửi lại.`,
      );
    }
  }

  private findActive(userId: string, purpose: EmailVerificationPurpose, now: Date) {
    return this.prisma.emailVerification.findFirst({
      where: { userId, purpose, consumedAt: null, expiresAt: { gt: now } },
      orderBy: { createdAt: "desc" },
      select: { id: true, email: true, codeHash: true, attempts: true, expiresAt: true },
    });
  }

  private async markConsumed(id: string, now: Date): Promise<void> {
    await this.prisma.emailVerification.update({ where: { id }, data: { consumedAt: now } });
  }
}

/** randomInt của crypto — không dùng Math.random cho thứ đóng vai trò như mật khẩu. */
function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}
