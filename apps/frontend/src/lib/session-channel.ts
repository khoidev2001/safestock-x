import type { AuthUser } from "./auth-store";

/**
 * Đường truyền tin giữa các tab web CỦA CÙNG MỘT TRÌNH DUYỆT.
 *
 * VÌ SAO CẦN: access token chỉ nằm trong bộ nhớ của từng tab, nên mỗi tab mới mở
 * đều phải tự đi gia hạn phiên. Mà mỗi lượt gia hạn xoay refresh token dùng một
 * lần — hai tab gia hạn cùng lúc thì một tab thua cuộc và bị đá ra ngoài, dù
 * người dùng chẳng làm gì sai.
 *
 * Nên tab mới hỏi các tab đang mở trước: "ai còn phiên thì cho xin". Có tab trả
 * lời thì không cần gọi máy chủ, không xoay token của ai cả. Không ai trả lời
 * (mở tab đầu tiên) thì mới đi gia hạn như cũ.
 */

const CHANNEL_NAME = "ung-pho-nhanh:phien-web";

type SessionMessage =
  { type: "session"; token: string; user: AuthUser } | { type: "ask" } | { type: "signed-out" };

export interface SharedSession {
  token: string;
  user: AuthUser;
}

export interface SessionChannelHandlers {
  /** Tab khác vừa có token mới (đăng nhập hoặc gia hạn) — dùng chung luôn. */
  onSession?: (session: SharedSession) => void;
  /** Tab khác hỏi xin phiên: nếu tab này đang có thì trả lời. */
  onAsk?: () => void;
  /** Tab khác đăng xuất — người dùng chủ động, nên tab này cũng phải ra theo. */
  onSignOut?: () => void;
}

function openChannel(): BroadcastChannel | null {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") return null;
  try {
    return new BroadcastChannel(CHANNEL_NAME);
  } catch {
    // Trình duyệt không cho mở (chế độ riêng tư nghiêm ngặt): quay về hành vi cũ,
    // mỗi tab tự gia hạn lấy. Không được phép làm hỏng việc đăng nhập.
    return null;
  }
}

function post(message: SessionMessage): void {
  const channel = openChannel();
  if (!channel) return;
  try {
    channel.postMessage(message);
  } finally {
    channel.close();
  }
}

export function publishSession(token: string, user: AuthUser): void {
  post({ type: "session", token, user });
}

export function publishSignOut(): void {
  post({ type: "signed-out" });
}

/** Lắng nghe cho tới khi gọi hàm trả về để gỡ. */
export function listenToSessionChannel(handlers: SessionChannelHandlers): () => void {
  const channel = openChannel();
  if (!channel) return () => {};

  const onMessage = (event: MessageEvent<SessionMessage>) => {
    const message = event.data;
    if (!message || typeof message !== "object") return;
    if (message.type === "session" && message.token && message.user) {
      handlers.onSession?.({ token: message.token, user: message.user });
      return;
    }
    if (message.type === "ask") handlers.onAsk?.();
    if (message.type === "signed-out") handlers.onSignOut?.();
  };

  channel.addEventListener("message", onMessage);
  return () => {
    channel.removeEventListener("message", onMessage);
    channel.close();
  };
}

/**
 * Hỏi các tab đang mở xem có phiên nào dùng chung được không.
 *
 * Chờ tối đa `timeoutMs` — không có ai trả lời trong chừng đó thì coi như đây là
 * tab duy nhất. Để ngắn thôi: đây nằm trên đường mở trang.
 */
export function askPeersForSession(timeoutMs = 400): Promise<SharedSession | null> {
  const channel = openChannel();
  if (!channel) return Promise.resolve(null);

  return new Promise((resolve) => {
    let done = false;
    const finish = (session: SharedSession | null) => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      channel.removeEventListener("message", onMessage);
      channel.close();
      resolve(session);
    };

    const onMessage = (event: MessageEvent<SessionMessage>) => {
      const message = event.data;
      if (message?.type === "session" && message.token && message.user) {
        finish({ token: message.token, user: message.user });
      }
    };

    const timer = window.setTimeout(() => finish(null), timeoutMs);
    channel.addEventListener("message", onMessage);
    try {
      channel.postMessage({ type: "ask" } satisfies SessionMessage);
    } catch {
      finish(null);
    }
  });
}
