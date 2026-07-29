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
const OPTIONAL_BOOLEAN_KEYS = ["SIMULATION_MUTATION_ENABLED", "AUTH_COOKIE_SECURE"] as const;
const RUNTIME_VALUES = ["operational", "demo"] as const;

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

  const runtime = String(config.SAFESTOCK_RUNTIME ?? "")
    .trim()
    .toLowerCase();
  if (runtime && !RUNTIME_VALUES.includes(runtime as (typeof RUNTIME_VALUES)[number])) {
    errors.push("SAFESTOCK_RUNTIME chỉ nhận operational hoặc demo");
  }

  const simulatorEnabled =
    String(config.SIMULATION_MUTATION_ENABLED ?? "")
      .trim()
      .toLowerCase() === "true";
  if (simulatorEnabled) {
    if (runtime !== "demo") {
      errors.push("SIMULATION_MUTATION_ENABLED=true yêu cầu SAFESTOCK_RUNTIME=demo");
    }

    validateDemoRuntime(config, errors);
  }

  if (errors.length > 0) {
    throw new Error(`Cấu hình môi trường không hợp lệ:\n- ${errors.join("\n- ")}`);
  }
  return config;
}

function validateDemoRuntime(config: Record<string, unknown>, errors: string[]): void {
  const stackName = textValue(config.STACK_NAME);
  if (stackName !== "safestock_demo") {
    errors.push("Demo simulator yêu cầu STACK_NAME=safestock_demo");
  }
  if (textValue(config.BIND_ADDRESS) !== "127.0.0.1") {
    errors.push("Demo simulator yêu cầu BIND_ADDRESS=127.0.0.1");
  }

  const databaseUrl = parseUrl(config.DATABASE_URL, ["postgres:", "postgresql:"]);
  const databaseName = databaseUrl
    ? decodeURIComponent(databaseUrl.pathname.replace(/^\/+/, ""))
    : "";
  const postgresDb = textValue(config.POSTGRES_DB);
  const postgresUser = textValue(config.POSTGRES_USER);
  const postgresPassword = textValue(config.POSTGRES_PASSWORD);
  const postgresPort = textValue(config.POSTGRES_PORT);
  if (
    !databaseUrl ||
    databaseUrl.hostname.toLowerCase() !== "localhost" ||
    postgresDb !== "safestock_demo" ||
    postgresUser !== "safestock_demo" ||
    postgresPort !== "55434" ||
    !postgresPassword ||
    databaseName !== postgresDb ||
    decodeURIComponent(databaseUrl.username) !== postgresUser ||
    decodeURIComponent(databaseUrl.password) !== postgresPassword ||
    databaseUrl.port !== postgresPort
  ) {
    errors.push("Demo simulator yêu cầu DATABASE_URL khớp chính xác PostgreSQL demo local");
  }

  const redisUrl = parseUrl(config.REDIS_URL, ["redis:"]);
  const redisPort = textValue(config.REDIS_PORT);
  if (
    !redisUrl ||
    redisUrl.hostname.toLowerCase() !== "localhost" ||
    redisPort !== "56381" ||
    redisUrl.port !== "56381" ||
    redisUrl.username ||
    redisUrl.password ||
    !["", "/"].includes(redisUrl.pathname) ||
    redisUrl.search ||
    redisUrl.hash
  ) {
    errors.push("Demo simulator yêu cầu REDIS_URL khớp Redis demo local");
  }

  const apiPort = textValue(config.API_PORT);
  if (apiPort !== "3110") {
    errors.push("Demo simulator yêu cầu API_PORT riêng, không trùng cổng vận hành hoặc hạ tầng");
  }

  if (textValue(config.POSTGRES_CONTAINER) !== `${stackName}_postgres`) {
    errors.push("Demo simulator yêu cầu POSTGRES_CONTAINER khớp STACK_NAME");
  }
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

function parseUrl(value: unknown, protocols: string[]): URL | null {
  try {
    const url = new URL(String(value));
    return protocols.includes(url.protocol) ? url : null;
  } catch {
    return null;
  }
}

function textValue(value: unknown): string {
  return String(value ?? "").trim();
}
