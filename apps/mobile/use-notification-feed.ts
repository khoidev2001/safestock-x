import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { fetchNotifications, type Notification } from "./api";
import { requireApiBase } from "./config";
import { readOfflineCache, writeOfflineCache } from "./offline-cache";
import {
  dismissToast,
  mergeNotification,
  pushToast,
  type ToastEntry,
} from "./notification-feed-state";
import { giaiPhongTiengThongBao, phatTiengThongBao } from "./notification-sound";

export interface NotificationFeed {
  items: Notification[];
  loading: boolean;
  error: string | null;
  cacheStoredAt: string | null;
  connected: boolean;
  newIds: Set<string>;
  toasts: ToastEntry[];
  reload: () => void;
  dismiss: (key: string) => void;
}

/**
 * Nguồn thông báo dùng chung cho cả app.
 *
 * Trước đây socket nằm TRONG màn Thông báo, nên nó chỉ mở khi người dùng đang
 * đứng ở tab đó. Đang kiểm kê hay đang xem kho thì không có kết nối, và lệnh
 * điều phối mới về chỉ hiện ra lúc tình cờ mở tab Thông báo — với việc cứu hộ
 * thì đó là chậm trễ không chấp nhận được.
 *
 * Đưa lên vỏ app: socket mở suốt phiên đăng nhập, thông báo về là nổi lên ngay
 * dù người dùng đang ở tab nào.
 */
export function useNotificationFeed(token: string, userId: string): NotificationFeed {
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cacheStoredAt, setCacheStoredAt] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const socketRef = useRef<Socket | null>(null);
  // Đếm tăng dần để mỗi lượt hiện có khoá riêng, kể cả khi cùng một thông báo
  // được máy chủ gửi lại sau khi cập nhật.
  const toastSeq = useRef(0);
  /** Id các thông báo đã kêu chuông trong phiên này — không kêu lại lần hai. */
  const daKeuRef = useRef<Set<string>>(new Set());

  const load = useCallback(async () => {
    setError(null);
    let hasCachedData = false;
    try {
      const cached = await readOfflineCache<Notification[]>(userId, "notifications");
      if (cached) {
        hasCachedData = true;
        setItems(cached.data);
        setCacheStoredAt(cached.storedAt);
        setLoading(false);
      } else {
        setLoading(true);
      }
    } catch {
      setLoading(true);
    }
    try {
      const notifications = await fetchNotifications(token);
      setItems(notifications);
      setCacheStoredAt(null);
      await writeOfflineCache(userId, "notifications", notifications);
    } catch (e) {
      setError(
        hasCachedData
          ? "Đang dùng dữ liệu đã lưu vì chưa kết nối được ungphonhanh.life."
          : e instanceof Error
            ? e.message
            : "Lỗi tải dữ liệu",
      );
    } finally {
      setLoading(false);
    }
  }, [token, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Máy chủ suy ra phòng realtime từ chính token, không nhận phòng do client khai.
  useEffect(() => {
    let socketBase: string;
    try {
      socketBase = requireApiBase();
    } catch (e) {
      setError(e instanceof Error ? e.message : "APK chưa được cấu hình địa chỉ ungphonhanh.life.");
      return;
    }
    const socket = io(socketBase, { transports: ["websocket"], auth: { token } });
    socketRef.current = socket;

    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));
    socket.on("connect_error", () => setConnected(false));
    socket.on("notification", (n: Notification) => {
      // Chuông kêu MỘT lần cho mỗi thông báo. Máy chủ gửi lại bản đã cập nhật
      // (hoặc socket mở lại) thì thẻ vẫn hiện nhưng không kêu nữa — kêu lại cho
      // một việc đã biết là dạy người trực bỏ qua tiếng chuông.
      //
      // Đặt NGOÀI hàm cập nhật state: React gọi hàm đó hai lần ở chế độ dev để
      // bắt hàm không thuần, nên phát tiếng trong đó là chuông kêu đôi.
      if (!daKeuRef.current.has(n.id)) {
        daKeuRef.current.add(n.id);
        void phatTiengThongBao();
      }
      setItems((prev) => {
        const next = mergeNotification(prev, n);
        void writeOfflineCache(userId, "notifications", next);
        return next;
      });
      setCacheStoredAt(null);
      setNewIds((prev) => new Set(prev).add(n.id));
      toastSeq.current += 1;
      const entry: ToastEntry = {
        key: `${n.id}#${toastSeq.current}`,
        id: n.id,
        kind: n.kind,
        title: n.title,
        body: n.body,
        missionId: n.missionId ?? null,
      };
      setToasts((prev) => pushToast(prev, entry));
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
      setConnected(false);
      // Đăng xuất hoặc đổi tài khoản: trả lại tài nguyên âm thanh.
      void giaiPhongTiengThongBao();
    };
  }, [token, userId]);

  const dismiss = useCallback((key: string) => {
    setToasts((prev) => dismissToast(prev, key));
  }, []);

  const reload = useCallback(() => {
    void load();
  }, [load]);

  return {
    items,
    loading,
    error,
    cacheStoredAt,
    connected,
    newIds,
    toasts,
    reload,
    dismiss,
  };
}
