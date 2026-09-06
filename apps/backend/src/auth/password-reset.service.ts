import { BadRequestException, HttpException, HttpStatus, Injectable, Logger } from "@nestjs/common";
import { EmailVerificationPurpose } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../prisma/prisma.service";
import { EmailVerificationService } from "./email-verification.service";
import { normalizeLoginEmail } from "./login-email";
import { isSimulationSystemActorEmail } from "../simulation/simulation-system-actor-identity";

const PURPOSE = EmailVerificationPurpose.PASSWORD_RESET;

/** Chặn một máy quét hàng loạt tên đăng nhập để bơm thư vào hộp thư người khác. */
const IP_WINDOW_MS = 15 * 60_000;
const MAX_REQUESTS_PER_IP = 10;

export const MIN_PASSWORD_LENGTH = 8;

/**
 * Câu trả lời DUY NHẤT của bước xin mã, dù tài khoản có tồn tại hay không.
 *
 * Nói "không tìm thấy tài khoản" là biến ô đăng nhập thành công cụ dò: gõ thử vài
 * chục tên là biết tên nào có thật. Người dùng thật vốn đã biết tên đăng nhập của
 * mình nên câu chung chung này không cản trở họ.
 */
const GENERIC_REQUEST_MESSAGE =
  "Nếu tên đăng nhập tồn tại và đã xác minh email, mã 6 số vừa được gửi tới email đó.";

@Injectable()
export class PasswordResetService {
  private readonly log = new Logger(PasswordResetService.name);
  private readonly ipHits = new Map<string, { count: number; expiresAt: number }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly verification: EmailVerificationService,
  ) {}

  /**
   * Bước 1: gửi mã 6 số tới email ĐÃ XÁC MINH của tài khoản.
   *
   * Chỉ gửi tới địa chỉ đã xác minh, không nhận địa chỉ do người gọi cung cấp — nếu
   * không thì ai cũng tự trỏ mã đặt lại mật khẩu về hộp thư của mình.
   */
  async requestCode(login: string, sourceIp: string): Promise<{ message: string }> {
    this.assertIpQuota(sourceIp);

    const email = normalizeLoginEmail(login);
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        fullName: true,
        notificationEmail: true,
        notificationEmailVerifiedAt: true,
      },
    });

    const eligible =
      user &&
      !isSimulationSystemActorEmail(user.email) &&
      user.notificationEmail &&
      user.notificationEmailVerifiedAt;
    if (!eligible) return { message: GENERIC_REQUEST_MESSAGE };

    try {
      await this.verification.issue({
        userId: user.id,
        email: user.notificationEmail!,
        purpose: PURPOSE,
        recipientName: user.fullName,
      });
    } catch (error) {
      // Hạn mức gửi là chuyện nội bộ của tài khoản đó; ném ra ngoài là lộ luôn tài
      // khoản có thật. Người bấm lại quá nhanh vẫn còn mã cũ trong hộp thư, nên câu
      // trả lời chung chung không sai với họ. Lỗi hạ tầng (SMTP hỏng) thì phải nói.
      if (error instanceof BadRequestException) {
        this.log.log(`Bỏ qua yêu cầu đặt lại mật khẩu do chạm hạn mức: ${email}`);
        return { message: GENERIC_REQUEST_MESSAGE };
      }
      throw error;
    }
    return { message: GENERIC_REQUEST_MESSAGE };
  }

  /** Bước 2: mã đúng → đổi mật khẩu và cắt mọi phiên đang mở của tài khoản. */
  async resetPassword(input: {
    login: string;
    code: string;
    password: string;
  }): Promise<{ ok: true }> {
    if (input.password.length < MIN_PASSWORD_LENGTH) {
      throw new BadRequestException(`Mật khẩu mới phải có ít nhất ${MIN_PASSWORD_LENGTH} ký tự.`);
    }

    const email = normalizeLoginEmail(input.login);
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, notificationEmail: true, notificationEmailVerifiedAt: true },
    });
    if (
      !user ||
      isSimulationSystemActorEmail(user.email) ||
      !user.notificationEmail ||
      !user.notificationEmailVerifiedAt
    ) {
      // Cùng câu với "mã sai": tài khoản không tồn tại và mã gõ nhầm phải không phân
      // biệt được từ bên ngoài, nếu không thì đây lại thành công cụ dò tên đăng nhập.
      throw new BadRequestException("Mã đã hết hạn hoặc chưa được yêu cầu. Hãy gửi lại mã.");
    }

    await this.verification.consume({
      userId: user.id,
      code: input.code,
      purpose: PURPOSE,
      // Email xác minh đổi sau lúc xin mã thì mã cũ mất hiệu lực: mã đã nằm ở một hộp
      // thư không còn là hộp thư của tài khoản này nữa.
      expectedEmail: user.notificationEmail,
    });

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: bcrypt.hashSync(input.password, 10),
        // Đổi mật khẩu vì nghi bị lộ thì phiên của kẻ kia phải chết theo, không thì
        // đổi mật khẩu chẳng đuổi được ai ra. Phải tăng cả hai số: tokenVersion cắt
        // refresh token, sessionVersion cắt access token đang chạy.
        tokenVersion: { increment: 1 },
        sessionVersion: { increment: 1 },
      },
    });
    this.log.log(`Đã đặt lại mật khẩu cho tài khoản ${user.email}.`);
    return { ok: true };
  }

  private assertIpQuota(sourceIp: string): void {
    const now = Date.now();
    const record = this.ipHits.get(sourceIp);
    if (!record || record.expiresAt <= now) {
      this.ipHits.set(sourceIp, { count: 1, expiresAt: now + IP_WINDOW_MS });
      return;
    }
    record.count += 1;
    if (record.count > MAX_REQUESTS_PER_IP) {
      const minutes = Math.max(1, Math.ceil((record.expiresAt - now) / 60_000));
      throw new HttpException(
        `Đã yêu cầu đặt lại mật khẩu quá nhiều lần. Vui lòng thử lại sau ${minutes} phút.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }
}
