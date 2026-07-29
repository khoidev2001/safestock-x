import { useAuth } from "./auth-store";

function resolveApiBase(): string {
  const configuredBase = process.env.NEXT_PUBLIC_API_URL;
  if (typeof window === "undefined") return configuredBase ?? "";

  if (window.location.protocol === "https:") return window.location.origin;
  if (configuredBase && !configuredBase.includes("localhost")) return configuredBase;

  return `${window.location.protocol}//${window.location.hostname}:3100`;
}

const BASE = resolveApiBase();

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function apiFetch<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await rawFetch(path, options);
  if (response.status !== 401) return handle<T>(response);

  const refreshed = await tryRefresh();
  if (!refreshed) {
    useAuth.getState().clear();
    throw new ApiError(401, "Phiên đăng nhập hết hạn");
  }

  return handle<T>(await rawFetch(path, options));
}

function rawFetch(path: string, options: RequestInit) {
  const { token } = useAuth.getState();
  return fetch(`${BASE}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
}

async function handle<T>(response: Response): Promise<T> {
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new ApiError(response.status, data?.message ?? `Lỗi ${response.status}`);
  }
  return data as T;
}

async function tryRefresh(): Promise<boolean> {
  const { setAuth } = useAuth.getState();

  try {
    const response = await fetch(`${BASE}/api/auth/refresh`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "X-Session-Transport": "web",
      },
    });
    if (!response.ok) return false;

    const data = await response.json();
    setAuth(data.accessToken, data.user);
    return true;
  } catch {
    return false;
  }
}

export async function restoreWebSession(): Promise<boolean> {
  return tryRefresh();
}

export async function closeWebSession(): Promise<void> {
  const { token } = useAuth.getState();
  try {
    await fetch(`${BASE}/api/auth/logout`, {
      method: "POST",
      credentials: "include",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  } finally {
    useAuth.getState().clear();
  }
}

export { ApiError, BASE };
