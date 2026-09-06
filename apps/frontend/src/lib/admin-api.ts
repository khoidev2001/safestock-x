import { apiFetch } from "./api";
import type { UserRole } from "@safestock/shared-types";

export interface AdminUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  isSuperAdmin: boolean;
  warehouseId: string | null;
  /** Số gọi được của người phụ trách — với trưởng thôn, đây là số của kho đó. */
  phone?: string | null;
  notificationEmail?: string | null;
  notificationEmailVerifiedAt?: string | null;
  createdAt?: string;
}

export interface CreateUserInput {
  email: string;
  password: string;
  fullName: string;
  role: UserRole;
  warehouseId?: string;
  /** Bắt buộc khi role = ADMIN: email nhận cảnh báo + mã 6 số đã gửi tới chính nó. */
  notificationEmail?: string;
  verificationCode?: string;
}

export function listUsers(): Promise<AdminUser[]> {
  return apiFetch<AdminUser[]>("/api/admin/users");
}

export function createUser(input: CreateUserInput): Promise<AdminUser> {
  return apiFetch<AdminUser>("/api/admin/users", { method: "POST", body: JSON.stringify(input) });
}

export function deleteUser(id: string): Promise<unknown> {
  return apiFetch(`/api/admin/users/${id}`, { method: "DELETE" });
}

export function updateUserPassword(id: string, password: string): Promise<AdminUser> {
  return apiFetch<AdminUser>(`/api/admin/users/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ password }),
  });
}

/**
 * Sửa số điện thoại của một tài khoản.
 *
 * `null` là xoá số. Gửi `null` chứ không gửi chuỗi rỗng: máy chủ phân biệt "bỏ
 * trống" với "không đụng tới", còn chuỗi rỗng thì rơi vào luật kiểm định dạng và
 * bị từ chối.
 */
export function updateUserPhone(id: string, phone: string | null): Promise<AdminUser> {
  return apiFetch<AdminUser>(`/api/admin/users/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ phone }),
  });
}

export interface IssuedEmailCode {
  email: string;
  expiresAt: string;
  /** "dev-log" = chưa cấu hình SMTP, mã không gửi tới hộp thư nào. */
  delivery: "smtp" | "dev-log";
  /** Chỉ ở chế độ dev: mã trần để hiện thẳng lên màn hình. */
  devCode?: string;
}

/** Xin mã 6 số cho email của tài khoản ADMIN sắp tạo (chỉ super admin gọi được). */
export function requestAdminEmailCode(email: string): Promise<IssuedEmailCode> {
  return apiFetch<IssuedEmailCode>("/api/admin/users/email-verification", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}
