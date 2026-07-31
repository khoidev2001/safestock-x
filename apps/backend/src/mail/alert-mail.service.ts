import { existsSync } from "fs";
import { join } from "path";
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";

export interface IncidentAlertInput {
  title: string;
  severity: string;
  confidence: number;
  kind: string;
  evidence: { note: string | null; occurredAt: Date }[];
}

export interface IncidentAlertTiming {
  observedAt: Date;
  receivedAt: Date;
  sentAt: Date;
}

const APP_NAME = "Ứng phó nhanh";
const LOGO_CID = "ung-pho-nhanh-logo";

const SEVERITY_LABEL: Record<string, string> = {
  LOW: "Thấp",
  MEDIUM: "Trung bình",
  HIGH: "Cao",
  CRITICAL: "Nghiêm trọng",
};

const SEVERITY_COLOR: Record<string, string> = {
  LOW: "#2563eb",
  MEDIUM: "#d97706",
  HIGH: "#ea580c",
  CRITICAL: "#dc2626",
};

/**
 * This service performs exactly one SMTP delivery attempt. It deliberately
 * propagates failures so AlertEmailOutboxService can persist a retry instead
 * of turning a network outage into an invisible dropped email.
 */
@Injectable()
export class AlertMailService {
  private readonly log = new Logger(AlertMailService.name);
  private transporter: Transporter | null = null;

  constructor(private readonly config: ConfigService) {}

  async sendIncidentAlert(
    incident: IncidentAlertInput,
    explanation: string | null,
    recipients: string[] = [],
    timing?: IncidentAlertTiming,
  ): Promise<void> {
    const recipientList = this.resolveRecipients(recipients);
    if (!this.isConfigured(recipientList)) {
      throw new Error("Email cảnh báo chưa được cấu hình hoặc không có người nhận");
    }

    const logoPath = this.resolveLogoPath();
    await this.getTransporter().sendMail({
      from: `"${APP_NAME}" <${this.config.get<string>("ALERT_EMAIL_FROM") || this.config.get<string>("SMTP_USER")!}>`,
      bcc: recipientList,
      subject: `⚠️ [${APP_NAME}] Cảnh báo kho: ${incident.title}`,
      text: this.buildText(incident, explanation, timing),
      html: this.buildHtml(incident, explanation, Boolean(logoPath), timing),
      attachments: logoPath
        ? [{ filename: "ung-pho-nhanh-mark-email.png", path: logoPath, cid: LOGO_CID }]
        : [],
    });
    this.log.log(
      `Đã gửi email cảnh báo "${incident.title}" tới ${recipientList.length} người nhận.`,
    );
  }

  private buildHtml(
    incident: IncidentAlertInput,
    explanation: string | null,
    hasLogo: boolean,
    timing?: IncidentAlertTiming,
  ): string {
    const severity = SEVERITY_LABEL[incident.severity] ?? incident.severity;
    const color = SEVERITY_COLOR[incident.severity] ?? "#6b7280";
    const logo = hasLogo
      ? `<img src="cid:${LOGO_CID}" alt="${APP_NAME}" width="48" height="48" style="display:block;border:0" />`
      : "";
    const evidence = incident.evidence.length
      ? incident.evidence
          .map(
            (item) =>
              `<tr><td style="padding:6px 12px;color:#64748b;vertical-align:top;white-space:nowrap">${this.escape(formatDate(item.occurredAt))}</td><td style="padding:6px 12px;color:#0f172a">${this.escape(item.note ?? "")}</td></tr>`,
          )
          .join("")
      : '<tr><td colspan="2" style="padding:6px 12px;color:#64748b">Không có bằng chứng chi tiết.</td></tr>';
    const explanationBlock = explanation
      ? `<div style="margin-top:18px;padding:12px 14px;background:#f5f3ff;border:1px solid #ddd6fe"><strong>Phân tích hỗ trợ</strong><p style="margin:6px 0 0;line-height:1.6">${this.escape(explanation)}</p></div>`
      : "";
    const timingBlock = timing
      ? `<div style="margin-top:18px;padding:12px 14px;background:#fff7ed;border:1px solid #fed7aa"><strong>Mốc thời gian cảnh báo</strong><p style="margin:6px 0 0;line-height:1.65">Phát hiện: ${this.escape(formatDate(timing.observedAt))}<br/>Backend nhận: ${this.escape(formatDate(timing.receivedAt))}<br/>Email gửi: ${this.escape(formatDate(timing.sentAt))}<br/>Độ trễ chuyển phát: ${this.escape(formatDelay(timing.sentAt.getTime() - timing.observedAt.getTime()))}</p></div>`
      : "";

    return `<!doctype html>
<html lang="vi"><body style="margin:0;padding:0;background:#f1f5f9;font-family:Segoe UI,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff">
<tr><td style="padding:20px 24px;background:#0f172a;color:#fff"><table role="presentation"><tr>${logo ? `<td style="padding-right:12px">${logo}</td>` : ""}<td><strong style="font-size:18px">${APP_NAME}</strong><br/><span style="font-size:12px;color:#94a3b8">Cảnh báo sự cố kho tự động</span></td></tr></table></td></tr>
<tr><td style="height:4px;background:${color};font-size:0">&nbsp;</td></tr>
<tr><td style="padding:24px;color:#0f172a"><span style="display:inline-block;padding:4px 10px;background:${color}1a;color:${color};font-size:12px;font-weight:700">Mức độ: ${this.escape(severity)}</span><h1 style="font-size:20px">${this.escape(incident.title)}</h1><p>Hệ thống phát hiện sự cố mới tại kho. Vui lòng đối chiếu bằng chứng cảm biến và kiểm tra thực tế trước khi xử lý.</p><h2 style="font-size:14px;margin-top:20px">Bằng chứng theo thời gian</h2><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;font-size:13px">${evidence}</table>${explanationBlock}${timingBlock}</td></tr>
<tr><td style="padding:16px 24px;background:#f8fafc;color:#64748b;font-size:11px">Email tự động từ ${APP_NAME}.</td></tr>
</table></td></tr></table></body></html>`;
  }

  private buildText(
    incident: IncidentAlertInput,
    explanation: string | null,
    timing?: IncidentAlertTiming,
  ): string {
    const severity = SEVERITY_LABEL[incident.severity] ?? incident.severity;
    const lines = [
      `${APP_NAME} — phát hiện sự cố mới tại kho.`,
      "",
      `• Sự cố: ${incident.title}`,
      `• Mức độ: ${severity}`,
      "",
      "Bằng chứng theo thời gian:",
      ...incident.evidence.map((item) => `  - ${formatDate(item.occurredAt)} — ${item.note ?? ""}`),
    ];
    if (explanation) lines.push("", `Phân tích hỗ trợ: ${explanation}`);
    if (timing) {
      lines.push(
        "",
        "Mốc thời gian cảnh báo:",
        `  - Phát hiện: ${formatDate(timing.observedAt)}`,
        `  - Backend nhận: ${formatDate(timing.receivedAt)}`,
        `  - Email gửi: ${formatDate(timing.sentAt)}`,
        `  - Độ trễ chuyển phát: ${formatDelay(timing.sentAt.getTime() - timing.observedAt.getTime())}`,
      );
    }
    return lines.join("\n");
  }

  private escape(text: string): string {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  private resolveLogoPath(): string | null {
    const candidates = [
      join(__dirname, "..", "..", "assets", "ung-pho-nhanh-mark-email.png"),
      join(__dirname, "..", "..", "..", "assets", "ung-pho-nhanh-mark-email.png"),
      join(process.cwd(), "assets", "ung-pho-nhanh-mark-email.png"),
    ];
    return candidates.find((path) => existsSync(path)) ?? null;
  }

  private getTransporter(): Transporter {
    if (this.transporter) return this.transporter;
    const port = Number(this.config.get("SMTP_PORT") ?? 465);
    const secure = this.config.get("SMTP_SECURE");
    this.transporter = nodemailer.createTransport({
      host: this.config.get<string>("SMTP_HOST"),
      port,
      secure: secure == null || secure === "" ? port === 465 : this.parseBool(secure),
      auth: {
        user: this.config.get<string>("SMTP_USER"),
        pass: this.config.get<string>("SMTP_PASS"),
      },
    });
    return this.transporter;
  }

  private resolveRecipients(recipients: string[]): string[] {
    const supplied = recipients
      .flatMap((email) => email.split(/[;,]/))
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean);
    if (supplied.length > 0) return [...new Set(supplied)];
    return [this.config.get<string>("ALERT_EMAIL_TO") ?? ""]
      .flatMap((email) => email.split(/[;,]/))
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean);
  }

  private isConfigured(recipients: string[]): boolean {
    return Boolean(
      this.parseBool(this.config.get("ALERT_EMAIL_ENABLED")) &&
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

function formatDate(value: Date): string {
  return value.toLocaleString("vi-VN");
}

function formatDelay(milliseconds: number): string {
  const seconds = Math.max(0, Math.round(milliseconds / 1_000));
  const minutes = Math.floor(seconds / 60);
  return minutes > 0 ? `${minutes} phút ${seconds % 60} giây` : `${seconds} giây`;
}
