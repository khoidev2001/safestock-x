/**
 * Validate env lúc khởi động (BE-I): thiếu biến BẮT BUỘC → ném lỗi rõ ràng, app KHÔNG start.
 * Hàm thuần (test được), không thêm dependency — cắm vào ConfigModule.forRoot({ validate }).
 * Biến có default/fallback (AI, GEO, REDIS...) KHÔNG bắt buộc — chỉ chặn cái mà thiếu là sập runtime.
 */

const REQUIRED_ENV = ["DATABASE_URL", "JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET"] as const;

// Secret quá ngắn → dễ đoán, coi như chưa cấu hình nghiêm túc. 16 ký tự tối thiểu.
const MIN_SECRET_LENGTH = 16;
const SECRET_KEYS = ["JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET"] as const;

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
    if (value != null && String(value).trim() !== "" && String(value).length < MIN_SECRET_LENGTH) {
      errors.push(`${key} quá ngắn (< ${MIN_SECRET_LENGTH} ký tự) — dùng secret mạnh hơn`);
    }
  }

  if (config.JWT_ACCESS_SECRET && config.JWT_ACCESS_SECRET === config.JWT_REFRESH_SECRET) {
    errors.push("JWT_ACCESS_SECRET và JWT_REFRESH_SECRET không được trùng nhau");
  }

  if (errors.length > 0) {
    throw new Error(`Cấu hình môi trường không hợp lệ:\n- ${errors.join("\n- ")}`);
  }
  return config;
}
