import type { Request, Response } from "express";

export const WEB_SESSION_TRANSPORT = "web";
export const REFRESH_COOKIE_NAME = "ung_pho_nhanh_refresh";

const REFRESH_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function isWebSessionTransport(value: string | undefined): boolean {
  return value === WEB_SESSION_TRANSPORT;
}

export function readRefreshCookie(request: Request): string | null {
  const header = request.headers.cookie;
  if (!header) return null;

  for (const entry of header.split(";")) {
    const [rawName, ...rawValue] = entry.trim().split("=");
    if (rawName !== REFRESH_COOKIE_NAME) continue;
    const value = rawValue.join("=");
    if (!value) return null;
    try {
      return decodeURIComponent(value);
    } catch {
      return null;
    }
  }
  return null;
}

export function setRefreshCookie(response: Response, refreshToken: string, secure: boolean): void {
  response.cookie(REFRESH_COOKIE_NAME, refreshToken, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    maxAge: REFRESH_COOKIE_MAX_AGE_MS,
    path: "/api/auth",
  });
}

export function clearRefreshCookie(response: Response, secure: boolean): void {
  response.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/api/auth",
  });
}

export function useSecureAuthCookie(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === "true";
}
