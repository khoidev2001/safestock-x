import { existsSync } from "fs";
import { join } from "path";
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";

/** Dữ liệu tối thiểu để soạn email cảnh báo (khớp Incident + evidence đã persist). */
export interface IncidentAlertInput {
  title: string;
  severity: string;
  confidence: number;
  kind: string;
  evidence: { note: string | null; occurredAt: Date }[];
}

const APP_NAME = "Ứng phó nhanh";
const LOGO_CID = "ung-pho-nhanh-logo"; // nhúng inline (Content-ID) → email tự chứa, xem offline được.

const SEVERITY_LABEL: Record<string, string> = {
  LOW: "Thấp",
  MEDIUM: "Trung bình",
  HIGH: "Cao",
  CRITICAL: "Nghiêm trọng",
};

// Màu badge mức độ (đồng bộ tinh thần severityTone của UI).
const SEVERITY_COLOR: Record<string, string> = {
  LOW: "#2563eb",
  MEDIUM: "#d97706",
  HIGH: "#ea580c",
  CRITICAL: "#dc2626",
};

/**
 * Gửi email cảnh báo sự cố (BE — kênh #4), có thương hiệu "Ứng phó nhanh" + logo.
 * Guard isConfigured() giống BackupService: thiếu cấu hình SMTP hoặc ALERT_EMAIL_ENABLED!=true
 * → SKIP ÊM (log, không throw). Mọi lỗi gửi bị NUỐT (log warn) — email KHÔNG được làm hỏng
 * luồng sự cố/realtime.
 *
 * Không bịa số: nội dung email chỉ ghép từ dữ liệu sự cố đã tính + bằng chứng thật;
 * đoạn AI (nếu có) do LLM diễn giải cùng ràng buộc không bịa số.
 */
@Injectable()
export class AlertMailService {
  private readonly log = new Logger(AlertMailService.name);
  private transporter: Transporter | null = null;

  constructor(private config: ConfigService) {}

  async sendIncidentAlert(
    incident: IncidentAlertInput,
    explanation: string | null,
    recipients: string[] = [],
  ): Promise<void> {
    const recipientList = this.resolveRecipients(recipients);
    if (!this.isConfigured(recipientList)) {
      this.log.warn("Email cảnh báo chưa bật (ALERT_EMAIL_ENABLED/SMTP_* thiếu) — bỏ qua gửi mail.");
      return;
    }
    try {
      const transporter = this.getTransporter();
      const from = `"${APP_NAME}" <${this.config.get<string>("ALERT_EMAIL_FROM") || this.config.get<string>("SMTP_USER")!}>`;
      const logoPath = this.resolveLogoPath();
      await transporter.sendMail({
        from,
        bcc: recipientList,
        subject: `⚠️ [${APP_NAME}] Cảnh báo kho: ${incident.title}`,
        text: this.buildText(incident, explanation),
        html: this.buildHtml(incident, explanation, Boolean(logoPath)),
        attachments: logoPath
          ? [{ filename: "ung-pho-nhanh-mark-email.png", path: logoPath, cid: LOGO_CID }]
          : [],
      });
      this.log.log(`Đã gửi email cảnh báo "${incident.title}" tới ${recipientList.length} người nhận.`);
    } catch (error) {
      // Nuốt lỗi: SMTP sai/mạng hỏng không được phá luồng sự cố.
      this.log.warn(`Gửi email cảnh báo lỗi: ${(error as Error).message}`);
    }
  }

  /** Bản HTML có thương hiệu (logo + tên app + badge mức độ). Layout table cho tương thích email client. */
  private buildHtml(incident: IncidentAlertInput, explanation: string | null, hasLogo: boolean): string {
    const sev = SEVERITY_LABEL[incident.severity] ?? incident.severity;
    const sevColor = SEVERITY_COLOR[incident.severity] ?? "#6b7280";
    // Logo email dùng nền trong suốt để nền header luôn liền mạch khi client tự đổi dark mode.
    const logoImg = hasLogo
      ? `<img src="cid:${LOGO_CID}" alt="${APP_NAME}" width="52" height="52" style="display:block;width:52px;height:52px;border:0;outline:none;" />`
      : "";
    const evidenceRows = incident.evidence.length
      ? incident.evidence
          .map(
            (e) => `
            <tr>
              <td style="padding:6px 12px;font-size:12px;color:#64748b;white-space:nowrap;vertical-align:top;">${this.escape(
                new Date(e.occurredAt).toLocaleString("vi"),
              )}</td>
              <td style="padding:6px 12px;font-size:13px;color:#0f172a;">${this.escape(e.note ?? "")}</td>
            </tr>`,
          )
          .join("")
      : `<tr><td colspan="2" style="padding:6px 12px;font-size:13px;color:#64748b;">Không có bằng chứng chi tiết.</td></tr>`;

    const explanationBlock = explanation
      ? `
        <div style="margin-top:20px;padding:14px 16px;background:#f5f3ff;border:1px solid #ddd6fe;border-radius:10px;">
          <p style="margin:0;font-size:14px;line-height:1.6;color:#312e81;">${this.escape(explanation)}</p>
        </div>`
      : "";

    return `<!doctype html>
<html lang="vi">
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08);">
          <!-- Header thương hiệu -->
          <tr>
            <td bgcolor="#0f172a" style="padding:20px 24px;background-color:#0f172a;">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  ${hasLogo ? `<td style="padding-right:12px;vertical-align:middle;">${logoImg}</td>` : ""}
                  <td style="vertical-align:middle;">
                    <div style="font-size:18px;font-weight:700;color:#ffffff;">${APP_NAME}</div>
                    <div style="font-size:12px;color:#94a3b8;">Cảnh báo sự cố kho tự động</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Dải mức độ -->
          <tr>
            <td style="height:4px;background:${sevColor};font-size:0;line-height:0;">&nbsp;</td>
          </tr>
          <!-- Nội dung -->
          <tr>
            <td style="padding:24px;">
              <span style="display:inline-block;padding:4px 12px;border-radius:999px;background:${sevColor}1a;color:${sevColor};font-size:12px;font-weight:700;">Mức độ: ${this.escape(
                sev,
              )}</span>
              <h1 style="margin:14px 0 4px;font-size:20px;color:#0f172a;">${this.escape(incident.title)}</h1>
              <p style="margin:0;font-size:13px;color:#64748b;">Hệ thống phát hiện sự cố mới tại kho.</p>
              <p style="margin:8px 0 0;font-size:13px;line-height:1.6;color:#334155;">Vui lòng đối chiếu bằng chứng cảm biến và kiểm tra thực tế trước khi xử lý.</p>

              <div style="margin-top:20px;font-size:13px;font-weight:600;color:#334155;">Bằng chứng theo thời gian</div>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;border:1px solid #e2e8f0;border-radius:10px;border-collapse:separate;overflow:hidden;">
                ${evidenceRows}
              </table>

              ${explanationBlock}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:16px 24px;background:#f8fafc;border-top:1px solid #e2e8f0;">
              <p style="margin:0;font-size:11px;color:#94a3b8;line-height:1.6;">Email tự động từ hệ thống <strong style="color:#64748b;">${APP_NAME}</strong>.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  }

  /** Bản text thuần (fallback cho client không đọc HTML). */
  private buildText(incident: IncidentAlertInput, explanation: string | null): string {
    const sev = SEVERITY_LABEL[incident.severity] ?? incident.severity;
    const lines = [
      `${APP_NAME} — phát hiện sự cố mới tại kho.`,
      ``,
      `• Sự cố: ${incident.title}`,
      `• Mức độ: ${sev}`,
      `• Khuyến nghị: Đối chiếu bằng chứng cảm biến và kiểm tra thực tế trước khi xử lý.`,
      ``,
      `Bằng chứng theo thời gian:`,
      ...incident.evidence.map(
        (e) => `  - ${new Date(e.occurredAt).toLocaleString("vi")} — ${e.note ?? ""}`,
      ),
      ``,
    ];
    if (explanation) lines.push(explanation);
    return lines.join("\n");
  }

  /** Chống XSS/hỏng layout khi title/note lọt ký tự HTML (dù nguồn nội bộ, vẫn escape cho chắc). */
  private escape(text: string): string {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /**
   * Tìm logo trên đĩa. __dirname khác nhau dev (src/mail) vs prod (dist/src/mail) → thử nhiều ứng viên;
   * không thấy → trả null (email vẫn gửi, chỉ thiếu ảnh, không vỡ).
   */
  private resolveLogoPath(): string | null {
    const candidates = [
      join(__dirname, "..", "..", "assets", "ung-pho-nhanh-mark-email.png"), // dev: src/mail → apps/backend/assets
      join(__dirname, "..", "..", "..", "assets", "ung-pho-nhanh-mark-email.png"), // prod: dist/src/mail → apps/backend/assets
      join(process.cwd(), "assets", "ung-pho-nhanh-mark-email.png"), // fallback: cwd = apps/backend
    ];
    return candidates.find((p) => existsSync(p)) ?? null;
  }

  private getTransporter(): Transporter {
    if (this.transporter) return this.transporter;
    const port = Number(this.config.get("SMTP_PORT") ?? 465);
    const secureRaw = this.config.get("SMTP_SECURE");
    this.transporter = nodemailer.createTransport({
      host: this.config.get<string>("SMTP_HOST"),
      port,
      // Gmail: 465 = secure true; 587 = STARTTLS (secure false). Không set → suy theo port.
      secure: secureRaw == null || secureRaw === "" ? port === 465 : this.parseBool(secureRaw),
      auth: {
        user: this.config.get<string>("SMTP_USER"),
        pass: this.config.get<string>("SMTP_PASS"),
      },
    });
    return this.transporter;
  }

  private resolveRecipients(recipients: string[]): string[] {
    const personalRecipients = recipients
      .flatMap((email) => email.split(/[;,]/))
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean);
    if (personalRecipients.length > 0) return [...new Set(personalRecipients)];

    return [this.config.get<string>("ALERT_EMAIL_TO") ?? ""]
      .flatMap((email) => email.split(/[;,]/))
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean);
  }

  /** Bật khi ALERT_EMAIL_ENABLED=true VÀ có đủ host/user/pass + người nhận. */
  private isConfigured(recipients: string[]): boolean {
    if (!this.parseBool(this.config.get("ALERT_EMAIL_ENABLED"))) return false;
    return Boolean(
      this.config.get("SMTP_HOST") &&
        this.config.get("SMTP_USER") &&
        this.config.get("SMTP_PASS") &&
        recipients.length > 0,
    );
  }

  private parseBool(value: unknown): boolean {
    return String(value).toLowerCase() === "true";
  }
}
