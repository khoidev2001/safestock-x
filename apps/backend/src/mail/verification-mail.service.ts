import { existsSync } from "fs";
import { join } from "path";
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { EmailVerificationPurpose } from "@prisma/client";
import type { Transporter } from "nodemailer";
import { createSmtpTransport, isSmtpConfigured } from "./smtp-transport";

const APP_NAME = "Ứng phó nhanh";
const LOGO_CID = "ung-pho-nhanh-logo";

/** Mã đi tới hộp thư thật, hay chỉ in ra log máy chủ (chế độ dev). */
export type VerificationDelivery = "smtp" | "dev-log";

interface MailCopy {
  /** Tiêu đề thư — người nhận đọc dòng này trước khi mở, phải nói đúng việc đang xảy ra. */
  subject: (code: string) => string;
  /** Dòng phụ dưới tên ứng dụng ở đầu thư. */
  banner: string;
  /** Câu giải thích chính: vì sao có mã này và nhập nó ở đâu. */
  intro: string;
  /** Bản chữ thuần, cho trình đọc thư không hiển thị HTML. */
  introText: string;
  /** Câu trấn an cuối thư — hậu quả của việc phớt lờ khác nhau theo từng luồng. */
  ignoreNote: string;
}

/**
 * Cùng một mã 6 số nhưng ba việc hoàn toàn khác nhau, nên nội dung thư phải khác nhau.
 *
 * Người nhận cần biết ngay mã này dùng để làm gì: thư "đặt lại mật khẩu" mà họ không
 * hề yêu cầu là dấu hiệu có người đang cố chiếm tài khoản — phải nói thẳng để họ cảnh
 * giác, chứ không thể dùng chung một câu chữ chung chung cho cả ba.
 */
const MAIL_COPY: Record<EmailVerificationPurpose, MailCopy> = {
  [EmailVerificationPurpose.NOTIFICATION_EMAIL]: {
    subject: (code) => `${code} là mã xác minh email nhận cảnh báo — ${APP_NAME}`,
    banner: "Xác minh email nhận cảnh báo",
    intro:
      "Nhập mã bên dưới trong mục <strong>Hồ sơ cá nhân</strong> để xác nhận đây đúng là email của bạn. Khi kho có sự cố, cảnh báo sẽ được gửi tới địa chỉ này.",
    introText:
      "Nhập mã này trong mục Hồ sơ cá nhân để hoàn tất việc thêm email nhận cảnh báo sự cố.",
    ignoreNote:
      "Nếu bạn không yêu cầu mã này, hãy bỏ qua email — không có thay đổi nào được áp dụng.",
  },
  [EmailVerificationPurpose.ADMIN_ACCOUNT]: {
    subject: (code) => `${code} là mã xác nhận liên kết tài khoản — ${APP_NAME}`,
    banner: "Xác nhận liên kết tài khoản",
    intro:
      "Quản trị cấp cao đang tạo một <strong>tài khoản quản trị xã</strong> và muốn liên kết địa chỉ email này với tài khoản đó. Đọc mã bên dưới cho người đang tạo tài khoản để hoàn tất. Sau khi liên kết, mọi cảnh báo sự cố của xã sẽ được gửi tới đây.",
    introText:
      "Quản trị cấp cao đang tạo một tài khoản quản trị xã và muốn liên kết địa chỉ email này với tài khoản đó. Đọc mã trên cho người đang tạo tài khoản để hoàn tất liên kết.",
    ignoreNote:
      "Nếu bạn không biết vì sao nhận được thư này, hãy bỏ qua — không có tài khoản nào được tạo nếu mã không được nhập.",
  },
  [EmailVerificationPurpose.PASSWORD_RESET]: {
    subject: (code) => `${code} là mã đặt lại mật khẩu — ${APP_NAME}`,
    banner: "Đặt lại mật khẩu",
    intro:
      "Có yêu cầu <strong>đặt lại mật khẩu</strong> cho tài khoản gắn với địa chỉ email này. Nhập mã bên dưới ở màn hình <strong>Quên mật khẩu</strong> để tạo mật khẩu mới. Sau khi đổi, mọi phiên đăng nhập cũ của tài khoản sẽ bị thu hồi.",
    introText:
      "Có yêu cầu đặt lại mật khẩu cho tài khoản gắn với địa chỉ email này. Nhập mã trên ở màn hình Quên mật khẩu để tạo mật khẩu mới. Sau khi đổi, mọi phiên đăng nhập cũ sẽ bị thu hồi.",
    ignoreNote:
      "Nếu bạn KHÔNG yêu cầu đặt lại mật khẩu, hãy bỏ qua email này — mật khẩu hiện tại vẫn giữ nguyên. Nhưng nếu nhận nhiều thư như vậy mà không phải bạn yêu cầu, hãy báo quản trị viên: có thể ai đó đang dò tài khoản của bạn.",
  },
};

/**
 * Gửi mã 6 số xác minh email cá nhân. Khác AlertMailService ở chỗ KHÔNG phụ thuộc
 * ALERT_EMAIL_ENABLED: người dùng phải xác minh được email ngay cả khi kênh cảnh báo
 * đang tắt, nếu không thì bật cảnh báo lên sẽ không có ai đã xác minh để mà gửi.
 * Lỗi gửi được ném lên để caller huỷ mã vừa tạo, tránh bắt người dùng chờ mã không tồn tại.
 */
@Injectable()
export class VerificationMailService {
  private readonly log = new Logger(VerificationMailService.name);
  private transporter: Transporter | null = null;

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return isSmtpConfigured(this.config);
  }

  /**
   * Chế độ dev: chưa có SMTP thì in mã ra log máy chủ để còn chạy thử được luồng.
   *
   * Phải BẬT TAY bằng MAIL_DEV_LOG_CODES=true và không bao giờ chạy ở production —
   * ở đó "email có thật" là điều kiện cả tính năng dựa vào, một đường vòng đọc log là
   * xác minh hộ được hộp thư người khác. Không mặc định theo kiểu "thiếu SMTP thì tự
   * bật": cấu hình hỏng lúc triển khai sẽ lặng lẽ biến thành lỗ hổng.
   */
  isDevLogEnabled(): boolean {
    const enabled = String(this.config.get("MAIL_DEV_LOG_CODES") ?? "").toLowerCase() === "true";
    const production = String(this.config.get("NODE_ENV") ?? "").toLowerCase() === "production";
    return enabled && !production;
  }

  /** Có đường nào để mã tới được người dùng hay không. */
  canSend(): boolean {
    return this.isConfigured() || this.isDevLogEnabled();
  }

  async sendVerificationCode(input: {
    email: string;
    code: string;
    fullName: string | null;
    expiresInMinutes: number;
    purpose: EmailVerificationPurpose;
  }): Promise<VerificationDelivery> {
    const copy = MAIL_COPY[input.purpose] ?? MAIL_COPY[EmailVerificationPurpose.NOTIFICATION_EMAIL];
    if (!this.isConfigured()) {
      if (!this.isDevLogEnabled()) {
        throw new Error("Máy chủ email chưa được cấu hình (SMTP_HOST/SMTP_USER/SMTP_PASS)");
      }
      this.log.warn(
        `[CHẾ ĐỘ DEV — chưa cấu hình SMTP] Mã xác minh cho ${input.email}: ${input.code} ` +
          `(hết hạn sau ${input.expiresInMinutes} phút). Đặt SMTP_HOST/SMTP_USER/SMTP_PASS để gửi email thật.`,
      );
      return "dev-log";
    }

    const logoPath = this.resolveLogoPath();
    const sender = this.resolveSender();
    await this.getTransporter().sendMail({
      from: `"${APP_NAME}" <${sender}>`,
      to: input.email,
      subject: copy.subject(input.code),
      text: buildText(input, copy),
      html: buildHtml(input, copy, Boolean(logoPath)),
      attachments: logoPath
        ? [{ filename: "ung-pho-nhanh-mark-email.png", path: logoPath, cid: LOGO_CID }]
        : [],
    });
    // Kèm tài khoản gửi: cấu hình SMTP chỉ đọc lúc khởi động, nên sửa .env mà quên
    // khởi động lại thì thư vẫn đi từ tài khoản cũ — dòng log này trả lời ngay câu
    // "sao vẫn là địa chỉ cũ" mà không phải đoán.
    this.log.log(`Đã gửi mã xác minh email tới ${maskEmail(input.email)} (gửi từ ${sender}).`);
    return "smtp";
  }

  /** Địa chỉ đứng tên gửi: ALERT_EMAIL_FROM nếu có khai, không thì chính hộp thư SMTP. */
  private resolveSender(): string {
    return (
      this.config.get<string>("ALERT_EMAIL_FROM") || this.config.get<string>("SMTP_USER") || ""
    );
  }

  private getTransporter(): Transporter {
    if (this.transporter) return this.transporter;
    this.transporter = createSmtpTransport(this.config);
    return this.transporter;
  }

  private resolveLogoPath(): string | null {
    const candidates = [
      join(__dirname, "..", "..", "assets", "ung-pho-nhanh-mark-email.png"),
      join(__dirname, "..", "..", "..", "assets", "ung-pho-nhanh-mark-email.png"),
      join(process.cwd(), "assets", "ung-pho-nhanh-mark-email.png"),
    ];
    return candidates.find((path) => existsSync(path)) ?? null;
  }
}

function buildText(
  input: { code: string; fullName: string | null; expiresInMinutes: number },
  copy: MailCopy,
) {
  return [
    `${input.fullName ? `Chào ${input.fullName},` : "Chào bạn,"}`,
    "",
    `${copy.banner} — mã của bạn là: ${input.code}`,
    `Mã có hiệu lực trong ${input.expiresInMinutes} phút.`,
    "",
    copy.introText,
    "",
    copy.ignoreNote,
    "",
    `Email tự động từ ${APP_NAME}.`,
  ].join("\n");
}

function buildHtml(
  input: { code: string; fullName: string | null; expiresInMinutes: number },
  copy: MailCopy,
  hasLogo: boolean,
): string {
  const logo = hasLogo
    ? `<img src="cid:${LOGO_CID}" alt="${APP_NAME}" width="48" height="48" style="display:block;border:0" />`
    : "";
  const greeting = input.fullName ? `Chào ${escapeHtml(input.fullName)},` : "Chào bạn,";
  return `<!doctype html>
<html lang="vi"><body style="margin:0;padding:0;background:#f1f5f9;font-family:Segoe UI,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff">
<tr><td style="padding:20px 24px;background:#0f172a;color:#fff"><table role="presentation"><tr>${logo ? `<td style="padding-right:12px">${logo}</td>` : ""}<td><strong style="font-size:18px">${APP_NAME}</strong><br/><span style="font-size:12px;color:#94a3b8">${escapeHtml(copy.banner)}</span></td></tr></table></td></tr>
<tr><td style="height:4px;background:#2563eb;font-size:0">&nbsp;</td></tr>
<tr><td style="padding:24px;color:#0f172a">
<p style="margin:0 0 12px">${greeting}</p>
<p style="margin:0 0 18px;line-height:1.6">${copy.intro}</p>
<div style="margin:0 0 18px;padding:16px;background:#f1f5f9;border:1px solid #cbd5e1;text-align:center">
<span style="display:block;font-size:34px;font-weight:700;letter-spacing:10px;color:#0f172a">${escapeHtml(input.code)}</span>
<span style="display:block;margin-top:8px;font-size:12px;color:#64748b">Mã có hiệu lực trong ${input.expiresInMinutes} phút</span>
</div>
<p style="margin:0;line-height:1.6;color:#64748b">${escapeHtml(copy.ignoreNote)}</p>
</td></tr>
<tr><td style="padding:16px 24px;background:#f8fafc;color:#64748b;font-size:11px">Email tự động từ ${APP_NAME}. Vui lòng không trả lời email này.</td></tr>
</table></td></tr></table></body></html>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Log không được để lộ nguyên địa chỉ email của người dùng. */
function maskEmail(email: string): string {
  const [name, domain] = email.split("@");
  if (!domain) return "***";
  const head = name.slice(0, 2);
  return `${head}${"*".repeat(Math.max(1, name.length - 2))}@${domain}`;
}
