import { ConfigService } from "@nestjs/config";
import * as nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";

/** true khi đủ host + user + pass để mở kết nối SMTP. */
export function isSmtpConfigured(config: ConfigService): boolean {
  return Boolean(
    config.get<string>("SMTP_HOST") &&
      config.get<string>("SMTP_USER") &&
      config.get<string>("SMTP_PASS"),
  );
}

/**
 * Mở transporter SMTP từ env. Cổng 465 mặc định là kênh mã hoá (secure), trừ khi
 * SMTP_SECURE nói khác — Gmail app-password dùng đúng cấu hình này.
 */
export function createSmtpTransport(config: ConfigService): Transporter {
  const port = Number(config.get("SMTP_PORT") ?? 465);
  const secure = config.get("SMTP_SECURE");
  return nodemailer.createTransport({
    host: config.get<string>("SMTP_HOST"),
    port,
    secure: secure == null || secure === "" ? port === 465 : parseSmtpBool(secure),
    auth: {
      user: config.get<string>("SMTP_USER"),
      pass: config.get<string>("SMTP_PASS"),
    },
  });
}

export function parseSmtpBool(value: unknown): boolean {
  return String(value).toLowerCase() === "true";
}
