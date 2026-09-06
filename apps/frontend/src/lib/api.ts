import { useAuth, type AuthUser } from "./auth-store";
import { maySessionExist, markSessionPresent, clearSessionMarker } from "./session-marker";
import { askPeersForSession, publishSession, publishSignOut } from "./session-channel";

function resolveApiBase(): string {
  const configuredBase = process.env.NEXT_PUBLIC_API_URL;
  if (typeof window === "undefined") return configuredBase ?? "";

  if (window.location.protocol === "https:") return window.location.origin;
  if (configuredBase && !configuredBase.includes("localhost")) return configuredBase;

  return `${window.location.protocol}//${window.location.hostname}:3110`;
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

/**
 * Lượt gia hạn đang chạy dở của TAB NÀY.
 *
 * Refresh token dùng một lần: bắn hai lượt gia hạn song song thì lượt sau chắc
 * chắn hỏng và kéo cả phiên đi theo. Mà một trang thường gọi nhiều API cùng lúc,
 * nên khi access token hết hạn là dính đúng cảnh đó. Ai tới sau thì đứng chờ kết
 * quả của lượt đang chạy, không mở lượt mới.
 */
let refreshInFlight: Promise<boolean> | null = null;

function tryRefresh(): Promise<boolean> {
  refreshInFlight ??= requestRefresh().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

/** Nhận một phiên (tự gia hạn hoặc xin từ tab khác) vào bộ nhớ của tab này. */
export function adoptSharedSession(token: string, user: AuthUser): void {
  useAuth.getState().setAuth(token, user);
  markSessionPresent();
}

async function requestRefresh(): Promise<boolean> {
  const previousToken = useAuth.getState().token;

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
      // Có thể chỉ là thua một cuộc đua: tab khác vừa xoay refresh token xong và
      // đang cầm token mới. Hỏi trước khi kết luận là hết phiên.
      const peer = await askPeersForSession();
      if (peer && peer.token !== previousToken) {
        adoptSharedSession(peer.token, peer.user);
        return true;
      }
      // Cookie đã hết hạn hoặc bị thu hồi: xoá dấu để lần mở trang sau không gọi
      // lại một lượt chắc chắn hỏng nữa.
      clearSessionMarker();
      return false;
    }

    const data = await response.json();
    adoptSharedSession(data.accessToken, data.user);
    // Chia cho các tab khác luôn, để không tab nào phải tự đi xoay token lần nữa.
    publishSession(data.accessToken, data.user);
    return true;
  } catch {
    return false;
  }
}

export async function restoreWebSession(): Promise<boolean> {
  // Chưa từng đăng nhập trên máy này thì không có gì để khôi phục. Gọi vẫn chỉ
  // nhận 401, mà lại in một dòng đỏ trong Console làm người xem tưởng app hỏng.
  if (!maySessionExist()) return false;

  // Tab khác đang mở và còn phiên thì xin dùng chung: nhanh hơn một vòng mạng, và
  // quan trọng hơn là không xoay refresh token — mở tab thứ hai không được phép
  // làm phiền tab thứ nhất.
  const peer = await askPeersForSession();
  if (peer) {
    adoptSharedSession(peer.token, peer.user);
    return true;
  }

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
    clearSessionMarker();
    // Đăng xuất là ý muốn của người dùng, không phải sự cố của riêng tab này:
    // các tab còn lại phải ra theo, chứ không ngồi lại với một token đã bị thu hồi.
    publishSignOut();
  }
}

export { ApiError, BASE };
