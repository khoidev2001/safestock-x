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
  return handleJson<T>(await authenticatedFetch(path, options));
}

/** Fetch dữ liệu nhị phân qua cùng phiên đăng nhập/refresh, không tạo URL công khai. */
export async function apiFetchBlob(path: string, options: RequestInit = {}): Promise<Blob> {
  const response = await authenticatedFetch(path, options);
  if (!response.ok) throw await responseError(response);
  return response.blob();
}

async function authenticatedFetch(path: string, options: RequestInit): Promise<Response> {
  const response = await rawFetch(path, options);
  if (response.status !== 401) return response;

  const refreshed = await tryRefresh();
  if (!refreshed) {
    useAuth.getState().clear();
    throw new ApiError(401, "Phiên đăng nhập hết hạn");
  }

  return rawFetch(path, options);
}

function rawFetch(path: string, options: RequestInit) {
  const { token } = useAuth.getState();
  const headers = new Headers(options.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (typeof options.body === "string" && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return fetch(`${BASE}${path}`, { ...options, headers });
}

async function handleJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text) as unknown;
    } catch {
      if (!response.ok) throw new ApiError(response.status, `Lỗi ${response.status}`);
      throw new ApiError(response.status, "Phản hồi từ máy chủ không hợp lệ");
    }
  }
  if (!response.ok) throw new ApiError(response.status, messageFrom(data, response.status));
  return data as T;
}

async function responseError(response: Response): Promise<ApiError> {
  const text = await response.text();
  if (!text) return new ApiError(response.status, `Lỗi ${response.status}`);
  try {
    return new ApiError(response.status, messageFrom(JSON.parse(text) as unknown, response.status));
  } catch {
    return new ApiError(response.status, `Lỗi ${response.status}`);
  }
}

function messageFrom(data: unknown, status: number): string {
  if (!data || typeof data !== "object" || !("message" in data)) return `Lỗi ${status}`;
  const message = (data as { message?: unknown }).message;
  if (typeof message === "string") return message;
  if (Array.isArray(message) && message.every((item) => typeof item === "string")) {
    return message.join("; ");
  }
  return `Lỗi ${status}`;
}

async function tryRefresh(): Promise<boolean> {
  const { refreshToken, setAuth } = useAuth.getState();
  if (!refreshToken) return false;

  try {
    const response = await fetch(`${BASE}/api/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    if (!response.ok) return false;

    const data = await response.json();
    setAuth(data.accessToken, data.refreshToken, data.user);
    return true;
  } catch {
    return false;
  }
}

export { ApiError, BASE };
