import { useAuth } from "./auth-store";
import { coTheConPhien, danhDauCoPhien, xoaDauPhien } from "./session-marker";

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

/**
 * Như `apiFetch` nhưng TRẢ NGUYÊN Response để bên gọi tự đọc theo dòng.
 *
 * `apiFetch` gọi `response.text()` — nó đợi trọn thân trả lời rồi mới trả về, tức
 * là nuốt mất đúng cái tính chảy dần mà đường này cần. Vẫn giữ nguyên luật gia hạn
 * phiên khi gặp 401, vì hết phiên giữa lúc đang hỏi là chuyện thường.
 */
export async function apiStream(path: string, options: RequestInit = {}): Promise<Response> {
  let response = await rawFetch(path, options);
  if (response.status === 401) {
    const refreshed = await tryRefresh();
    if (!refreshed) {
      useAuth.getState().clear();
      throw new ApiError(401, "Phiên đăng nhập hết hạn");
    }
    response = await rawFetch(path, options);
  }
  if (!response.ok || !response.body) {
    const text = await response.text().catch(() => "");
    let message = `Lỗi ${response.status}`;
    try {
      message = JSON.parse(text)?.message ?? message;
    } catch {
      // Thân trả lời không phải JSON thì giữ nguyên câu theo mã lỗi.
    }
    throw new ApiError(response.status, message);
  }
  return response;
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
    if (!response.ok) {
      // Cookie đã hết hạn hoặc bị thu hồi: xoá dấu để lần mở trang sau không gọi
      // lại một lượt chắc chắn hỏng nữa.
      xoaDauPhien();
      return false;
    }

    const data = await response.json();
    setAuth(data.accessToken, data.user);
    danhDauCoPhien();
    return true;
  } catch {
    return false;
  }
}

export async function restoreWebSession(): Promise<boolean> {
  // Chưa từng đăng nhập trên máy này thì không có gì để khôi phục. Gọi vẫn chỉ
  // nhận 401, mà lại in một dòng đỏ trong Console làm người xem tưởng app hỏng.
  if (!coTheConPhien()) return false;
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
    xoaDauPhien();
  }
}

export { ApiError, BASE };
