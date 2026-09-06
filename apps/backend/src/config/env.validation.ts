/**
 * Validate env lúc khởi động (BE-I): thiếu biến BẮT BUỘC → ném lỗi rõ ràng, app KHÔNG start.
 * Hàm thuần (test được), không thêm dependency — cắm vào ConfigModule.forRoot({ validate }).
 * Biến có default/fallback (AI, GEO, REDIS...) KHÔNG bắt buộc — chỉ chặn cái mà thiếu là sập runtime.
 */

import { validateCorsOrigins } from "./http-security";

const REQUIRED_ENV = ["DATABASE_URL", "JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET"] as const;

// Secret quá ngắn → dễ đoán, coi như chưa cấu hình nghiêm túc. 16 ký tự tối thiểu.
const MIN_SECRET_LENGTH = 16;
const SECRET_KEYS = ["JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET"] as const;

// Placeholder mẫu trong .env.example / hướng dẫn: nếu lọt lên môi trường thật thì
// secret coi như công khai → chặn ngay lúc boot thay vì chạy với JWT đoán được.
const SECRET_PLACEHOLDERS = new Set([
  "change_me",
  "change_me_access",
  "change_me_refresh",
  "changeme",
  "change-me",
  "your_secret_here",
  "your-secret-here",
  "secret",
  "jwt_secret",
  "jwt_access_secret",
  "jwt_refresh_secret",
  "placeholder",
  "example",
  "test",
  "todo",
]);
const OPTIONAL_BOOLEAN_KEYS = [
  "SIMULATION_MUTATION_ENABLED",
  "AUTH_COOKIE_SECURE",
  "MAIL_DEV_LOG_CODES",
  "SMS_DEV_LOG_CODES",
] as const;

export function validateEnv(config: Record<string, unknown>): Record<string, unknown> {
  const errors: string[] = [];

  for (const key of REQUIRED_ENV) {
    const value = config[key];
    if (value == null || String(value).trim() === "") {
      errors.push(`Thiếu biến môi trường bắt buộc: ${key}`);
    }
  }

  for (const key of SECRET_KEYS) {
    const value = config[key];
    if (value == null || String(value).trim() === "") continue;
    const raw = String(value);
    if (raw.length < MIN_SECRET_LENGTH) {
      errors.push(`${key} quá ngắn (< ${MIN_SECRET_LENGTH} ký tự) — dùng secret mạnh hơn`);
    }
    if (SECRET_PLACEHOLDERS.has(raw.trim().toLowerCase())) {
      errors.push(`${key} đang dùng giá trị placeholder công khai — sinh secret ngẫu nhiên mạnh`);
    }
  }

  if (config.JWT_ACCESS_SECRET && config.JWT_ACCESS_SECRET === config.JWT_REFRESH_SECRET) {
    errors.push("JWT_ACCESS_SECRET và JWT_REFRESH_SECRET không được trùng nhau");
  }

  const corsError = validateCorsOrigins(config.CORS_ALLOWED_ORIGINS);
  if (corsError) errors.push(corsError);

  // Mã xác minh in ra log là đường vòng chỉ dành cho lúc phát triển: ai đọc được log là
  // xác minh hộ được hộp thư người khác. Ở production thì chặn ngay lúc boot, đừng để
  // một dòng .env sót lại lặng lẽ hạ cấp cả tính năng "email phải có thật".
  if (
    String(config.NODE_ENV ?? "")
      .trim()
      .toLowerCase() === "production" &&
    String(config.MAIL_DEV_LOG_CODES ?? "")
      .trim()
      .toLowerCase() === "true"
  ) {
    errors.push("MAIL_DEV_LOG_CODES=true chỉ dùng khi phát triển — bỏ biến này ở production");
  }

  const bindAddress = textValue(config.BIND_ADDRESS);
  if (bindAddress && !isValidBindHost(bindAddress)) {
    errors.push("BIND_ADDRESS phải là IPv4/IPv6/hostname hợp lệ (vd 127.0.0.1 hoặc 0.0.0.0)");
  }

  const nodeEnv = String(config.NODE_ENV ?? "")
    .trim()
    .toLowerCase();
  if (nodeEnv === "production" && !String(config.CORS_ALLOWED_ORIGINS ?? "").trim()) {
    errors.push("NODE_ENV=production yêu cầu CORS_ALLOWED_ORIGINS chính xác cho web/LAN");
  }

  for (const key of OPTIONAL_BOOLEAN_KEYS) {
    const value = config[key];
    if (value == null || String(value).trim() === "") continue;
    if (!["true", "false"].includes(String(value).trim().toLowerCase())) {
      errors.push(`${key} chỉ nhận true hoặc false`);
    }
  }

  // Gõ sai biến này từng có thể làm tắt lặng lẽ cảnh báo mất tín hiệu thiết bị.
  // Chặn ngay lúc khởi động thay vì để kho chạy mà không ai canh cảm biến.
  const watchdogInterval = textValue(config.INCIDENT_WATCHDOG_INTERVAL_SECONDS);
  if (watchdogInterval && !/^\d+$/.test(watchdogInterval)) {
    errors.push(
      "INCIDENT_WATCHDOG_INTERVAL_SECONDS phải là số giây nguyên không âm (0 = tắt có chủ đích)",
    );
  }

  if (errors.length > 0) {
    throw new Error(`Cấu hình môi trường không hợp lệ:\n- ${errors.join("\n- ")}`);
  }
  return config;
}

/**
 * Host để `app.listen` bind. Mặc định 127.0.0.1 (an toàn: chỉ loopback) nếu không
 * cấu hình — muốn phục vụ LAN phải cố ý đặt BIND_ADDRESS=0.0.0.0. Trả về giá trị đã
 * validate; giá trị rác rơi về loopback thay vì để Node bind bừa.
 */
export function resolveBindAddress(config: Record<string, unknown>): string {
  const bindAddress = textValue(config.BIND_ADDRESS);
  if (bindAddress && isValidBindHost(bindAddress)) return bindAddress;
  return "127.0.0.1";
}

function isValidBindHost(value: string): boolean {
  const host = value.trim();
  if (!host || /\s/.test(host)) return false;
  if (host === "localhost") return true;
  // IPv6 (bao gồm ::, ::1, và dạng có ngoặc [..]).
  if (/^\[?[0-9a-fA-F:]+\]?$/.test(host) && host.includes(":")) return true;
  // Chuỗi toàn chữ số + dấu chấm chỉ hợp lệ khi là IPv4 đúng (chặn 999.1.1.1).
  if (/^[\d.]+$/.test(host)) return isIpv4(host);
  // Hostname RFC-1123 đơn giản.
  return /^(?=.{1,253}$)([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/.test(
    host,
  );
}

function isIpv4(value: string): boolean {
  const parts = value.split(".");
  if (parts.length !== 4) return false;
  return parts.every((part) => {
    if (!/^\d{1,3}$/.test(part)) return false;
    const num = Number(part);
    return num >= 0 && num <= 255;
  });
}

function textValue(value: unknown): string {
  return String(value ?? "").trim();
}
