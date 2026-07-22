import { apiFetch } from "./api";
import type { AuthUser } from "./auth-store";

export interface UpdateProfileInput {
  fullName: string;
  phone: string | null;
  notificationEmail: string | null;
  avatarUrl: string | null;
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
