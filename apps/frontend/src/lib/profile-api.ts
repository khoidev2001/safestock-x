import { apiFetch } from "./api";
import type { AuthUser } from "./auth-store";

export interface UpdateProfileInput {
  fullName: string;
  phone: string | null;
  avatarUrl: string | null;
}

/**
 * Email cảnh báo không nằm trong PATCH hồ sơ: nó chỉ đổi qua luồng xin mã → nhập mã,
 * nên backend giữ nó ở một nhóm endpoint riêng với trạng thái riêng.
 */
export interface NotificationEmailState {
  notificationEmail: string | null;
  notificationEmailVerifiedAt: string | null;
  /** Địa chỉ đang chờ nhập mã — còn giá trị nghĩa là còn mã sống, kể cả sau khi tải lại trang. */
  pendingEmail: string | null;
  pendingExpiresAt: string | null;
  /** Chỉ có ngay sau khi xin mã: "dev-log" = chưa cấu hình SMTP nên mã không gửi đi đâu. */
  delivery?: "smtp" | "dev-log";
  /** Chỉ ở chế độ dev: mã trần để hiện thẳng lên màn hình. */
  devCode?: string;
}

export function getProfile(): Promise<AuthUser> {
  return apiFetch<AuthUser>("/api/auth/me");
}

export function updateProfile(input: UpdateProfileInput): Promise<AuthUser> {
  return apiFetch<AuthUser>("/api/auth/me", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function getNotificationEmailState(): Promise<NotificationEmailState> {
  return apiFetch<NotificationEmailState>("/api/auth/me/notification-email");
}

export function requestNotificationEmailCode(email: string): Promise<NotificationEmailState> {
  return apiFetch<NotificationEmailState>("/api/auth/me/notification-email", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export function confirmNotificationEmailCode(code: string): Promise<NotificationEmailState> {
  return apiFetch<NotificationEmailState>("/api/auth/me/notification-email/verify", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}

export function cancelNotificationEmailCode(): Promise<NotificationEmailState> {
  return apiFetch<NotificationEmailState>("/api/auth/me/notification-email/pending", {
    method: "DELETE",
  });
}

export function removeNotificationEmail(): Promise<NotificationEmailState> {
  return apiFetch<NotificationEmailState>("/api/auth/me/notification-email", {
    method: "DELETE",
  });
}
