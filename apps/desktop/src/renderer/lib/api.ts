// API client cho app desktop — port từ apps/frontend/src/lib/api.ts nhưng:
//  - base URL cấu hình được (ô nhập IP để demo LAN), không phụ thuộc window.location.
//  - token giữ trong biến module (app 1 cửa sổ, không cần store phức tạp).
// Giữ nguyên cơ chế auto-refresh khi 401.

export interface AuthUser {
  userId: string;
  role: string;
  warehouseId?: string | null;
  [key: string]: unknown;
}

interface AuthState {
  base: string;
  accessToken: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
  sessionVersion: number;
}

const auth: AuthState = {
  base: "http://localhost:3100",
  accessToken: null,
  refreshToken: null,
  user: null,
  sessionVersion: 0,
};

export function getBase(): string {
  return auth.base;
}

export function getAccessToken(): string | null {
  return auth.accessToken;
}

export function getSessionVersion(): number {
  return auth.sessionVersion;
}

export function refreshAccessToken(): Promise<boolean> {
  return tryRefresh();
}

/** Chuẩn hoá host người dùng nhập ("192.168.1.5", "localhost:3100", "http://x") → URL đầy đủ. */
export function setBase(raw: string): void {
  const value = raw.trim().replace(/\/+$/, "");
  if (!value) {
    auth.base = "http://localhost:3100";
    return;
  }

  if (/^https?:\/\//i.test(value)) {
    auth.base = new URL(value).toString().replace(/\/+$/, "");
    return;
  }

  // Public HTTPS is intentionally exact: never turn ungphonhanh.life into
  // ungphonhanh.life:3100. A LAN hostname/IP remains the direct backend port.
  if (value.toLowerCase() === "ungphonhanh.life") {
    auth.base = "https://ungphonhanh.life";
    return;
  }

  const url = new URL(`http://${value}`);
  if (!url.port) url.port = "3100";
  auth.base = url.toString().replace(/\/+$/, "");
}

export function getUser(): AuthUser | null {
  return auth.user;
}

export function isAuthed(): boolean {
  return Boolean(auth.accessToken);
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Chuẩn hoá hồ sơ người dùng từ backend.
 *
 * Backend trả khoá `id`, còn cả app này dùng `userId`. Interface AuthUser có chỉ
 * mục `[key: string]: unknown` nên TypeScript KHÔNG bắt được chỗ lệch — `user.userId`
 * lặng lẽ là undefined ở lúc chạy. Hậu quả: mỗi lô số liệu xác nhận được ghi vào
 * hàng chờ với ownerUserId rỗng, đọc lại thì bộ kiểm tra loại bỏ, vòng gửi chạy
 * trên danh sách rỗng — không lỗi, không log, số liệu biến mất không dấu vết.
 */
function normalizeUser(raw: Record<string, unknown>): AuthUser {
  const id = typeof raw.userId === "string" ? raw.userId : raw.id;
  if (typeof id !== "string" || !id) {
    throw new ApiError(500, "Máy chủ không trả về định danh người dùng.");
  }
  return { ...raw, userId: id } as AuthUser;
}

export async function login(email: string, password: string): Promise<AuthUser> {
  const res = await fetch(`${auth.base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await parseBody(res);
  if (!res.ok) throw new ApiError(res.status, data?.message ?? `Đăng nhập lỗi ${res.status}`);
  auth.sessionVersion += 1;
  auth.accessToken = data.accessToken;
  auth.refreshToken = data.refreshToken;
  auth.user = normalizeUser(data.user);
  return auth.user;
}

export function logout(): void {
  auth.sessionVersion += 1;
  auth.accessToken = null;
  auth.refreshToken = null;
  auth.user = null;
}

/**
 * Đăng xuất do người dùng chủ động: thu hồi phiên phía máy chủ (tokenVersion++) để refresh
 * token cũ hết hiệu lực, rồi xoá phiên cục bộ. Best-effort — mất mạng vẫn đăng xuất cục bộ.
 */
export async function logoutServer(): Promise<void> {
  const accessToken = auth.accessToken;
  if (accessToken) {
    try {
      await fetch(`${auth.base}/api/auth/logout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    } catch {
      // Bỏ qua lỗi mạng — vẫn tiếp tục xoá phiên cục bộ bên dưới.
    }
  }
  logout();
}

export async function apiFetch<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await rawFetch(path, options);
  if (res.status !== 401) return handle<T>(res);

  const refreshed = await tryRefresh();
  if (!refreshed) {
    logout();
    throw new ApiError(401, "Phiên đăng nhập hết hạn");
  }
  return handle<T>(await rawFetch(path, options));
}

function rawFetch(path: string, options: RequestInit) {
  return fetch(`${auth.base}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(auth.accessToken ? { Authorization: `Bearer ${auth.accessToken}` } : {}),
      ...options.headers,
    },
  });
}

async function handle<T>(res: Response): Promise<T> {
  const data = await parseBody(res);
  if (!res.ok) throw new ApiError(res.status, data?.message ?? `Lỗi ${res.status}`);
  return data as T;
}

async function parseBody(res: Response) {
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function tryRefresh(): Promise<boolean> {
  const accessToken = auth.accessToken;
  const refreshToken = auth.refreshToken;
  const sessionVersion = auth.sessionVersion;
  if (!refreshToken) return false;
  try {
    const res = await fetch(`${auth.base}/api/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    if (auth.sessionVersion !== sessionVersion) return false;
    if (auth.refreshToken !== refreshToken) {
      return Boolean(auth.accessToken && auth.accessToken !== accessToken);
    }
    auth.accessToken = data.accessToken;
    auth.refreshToken = data.refreshToken;
    auth.user = normalizeUser(data.user);
    return true;
  } catch {
    return false;
  }
}
