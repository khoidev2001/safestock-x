const configuredApiBase = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();

/**
 * Release lấy endpoint từ build environment. `localhost` chỉ là fallback dev vì
 * trên thiết bị thật nó trỏ vào chính điện thoại, không phải máy chạy backend.
 */
export const API_BASE =
  configuredApiBase?.replace(/\/$/, "") ??
  (__DEV__ ? "http://localhost:3100" : "");

export function requireApiBase(): string {
  if (!API_BASE) {
    throw new Error(
      "APK chưa được cấu hình EXPO_PUBLIC_API_BASE_URL cho mạng LAN.",
    );
  }
  return API_BASE;
}
