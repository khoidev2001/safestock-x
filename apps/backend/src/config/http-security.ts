import type { NextFunction, Request, Response } from "express";

const DEVELOPMENT_ORIGINS = ["http://localhost:3200", "http://127.0.0.1:3200"];

type CorsCallback = (error: Error | null, allow?: boolean) => void;

export function resolveAllowedCorsOrigins(
  rawOrigins: string | undefined,
  nodeEnv = process.env.NODE_ENV,
): string[] {
  const configured = rawOrigins
    ?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (!configured?.length) {
    return nodeEnv === "production" ? [] : DEVELOPMENT_ORIGINS;
  }

  return [...new Set(configured.map(normalizeOrigin))];
}

export function validateCorsOrigins(rawOrigins: unknown): string | null {
  const origins = String(rawOrigins ?? "").trim();
  if (!origins) return null;

  try {
    origins
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean)
      .forEach(normalizeOrigin);
    return null;
  } catch {
    return "CORS_ALLOWED_ORIGINS phải là danh sách origin http(s), phân tách bằng dấu phẩy";
  }
}

export function createCorsOriginValidator(allowedOrigins: string[]) {
  const allowlist = new Set(allowedOrigins);

  return (origin: string | undefined, callback: CorsCallback): void => {
    // Native mobile, health probes and server-to-server calls do not send Origin.
    if (!origin) {
      callback(null, true);
      return;
    }
    if (allowlist.has(origin)) {
      callback(null, true);
      return;
    }
    callback(null, false);
  };
}

export function createRuntimeCorsOriginValidator() {
  return (origin: string | undefined, callback: CorsCallback): void => {
    const allowedOrigins = resolveAllowedCorsOrigins(
      process.env.CORS_ALLOWED_ORIGINS,
      process.env.NODE_ENV,
    );
    createCorsOriginValidator(allowedOrigins)(origin, callback);
  };
}

export function applyApiSecurityHeaders(
  req: Request,
  response: Response,
  next: NextFunction,
): void {
  if (req.path.startsWith("/api")) {
    response.setHeader(
      "Content-Security-Policy",
      "default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
    );
    response.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    response.setHeader("Permissions-Policy", "camera=(), geolocation=(), microphone=()");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("X-Frame-Options", "DENY");
  }
  next();
}

function normalizeOrigin(value: string): string {
  const url = new URL(value);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error("Invalid CORS origin");
  }
  return url.origin;
}
