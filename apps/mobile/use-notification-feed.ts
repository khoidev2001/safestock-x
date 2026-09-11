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
import { PAGE_SIZE, appendPage, hasMoreAfter, nextCursor } from "./paged-list-state";
import { releaseNotificationSound, playNotificationSound } from "./notification-sound";

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
  /** Đang tải thêm một trang phía dưới (khác `loading` — lượt tải đầu). */
  loadingMore: boolean;
  /** Máy chủ còn thông báo cũ hơn để tải không. */
  hasMore: boolean;
  /** Lượt tải thêm gần nhất hỏng — khác hẳn "đã xem hết", nên nói khác nhau. */
  moreError: boolean;
  /** Cuộn tới đáy: xin trang tiếp. Gọi thừa không sao, hàm tự bỏ qua. */
  loadMore: () => void;
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
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [moreError, setMoreError] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  /**
   * Có một lượt tải thêm đang bay hay không, đọc được NGAY.
   *
   * `loadingMore` là state nên nó chỉ đổi ở lượt vẽ sau; mà `FlatList` bắn
   * `onEndReached` nhiều lần liên tiếp trong cùng một nhịp cuộn. Chốt bằng state
   * thì hai ba lượt đầu cùng thấy `false` và cùng xin một trang — ba lượt gọi
   * mạng cho một trang, và trang đó bị ghép vào ba lần (chỗ ghép có lọc trùng nên
   * không nhân đôi dòng, nhưng ba lượt tải trên sóng yếu thì người dùng thấy).
   */
  const loadingMoreRef = useRef(false);
  /**
   * Bản danh sách mới nhất, đọc được từ trong hàm tải thêm.
   *
   * `loadMore` được `useCallback` giữ lại giữa các lượt vẽ, nên nếu nó đọc thẳng
   * `items` thì nó đọc bản chụp của lượt vẽ lúc nó được tạo — tức con trỏ luôn là
   * cuối TRANG ĐẦU, và mọi lượt cuộn đều xin lại đúng trang thứ hai.
   */
  const itemsRef = useRef<Notification[]>([]);
  itemsRef.current = items;
  // Đếm tăng dần để mỗi lượt hiện có khoá riêng, kể cả khi cùng một thông báo
  // được máy chủ gửi lại sau khi cập nhật.
  const toastSeq = useRef(0);
  /** Id các thông báo đã kêu chuông trong phiên này — không kêu lại lần hai. */
  const chimedIdsRef = useRef<Set<string>>(new Set());

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
      const notifications = await fetchNotifications(token, { limit: PAGE_SIZE });
      setItems(notifications);
      setHasMore(hasMoreAfter(notifications));
      setMoreError(false);
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
      if (!chimedIdsRef.current.has(n.id)) {
        chimedIdsRef.current.add(n.id);
        void playNotificationSound();
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
      void releaseNotificationSound();
    };
  }, [token, userId]);

  /**
   * Tải thêm một trang thông báo cũ hơn.
   *
   * Hỏng thì KHÔNG dựng chữ lỗi đỏ lên đầu màn hình: danh sách đang đọc vẫn còn
   * nguyên và người dùng chỉ mất phần cũ hơn, trong khi một dải lỗi đỏ ở đầu
   * trang nói như thể cả hộp thông báo vừa hỏng. Chỉ ghi cờ `moreError` để chân
   * trang nói đúng "chưa tải thêm được" — im lặng rồi hiện "đã xem hết" là nói
   * dối đúng vào lúc còn thông báo chưa đọc nằm bên dưới.
   */
  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const cursor = nextCursor(itemsRef.current);
      if (!cursor) return;
      const page = await fetchNotifications(token, { limit: PAGE_SIZE, cursor });
      setItems((prev) => appendPage(prev, page));
      setHasMore(hasMoreAfter(page));
      setMoreError(false);
    } catch {
      setHasMore(false);
      setMoreError(true);
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [token]);

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
    loadingMore,
    hasMore,
    moreError,
    /**
     * Cửa duy nhất ra ngoài, có sẵn chốt: chỉ gọi khi còn trang sau, hoặc khi
     * lượt trước hỏng (chân trang mời bấm thử lại).
     *
     * Không có chốt này thì `onEndReached` của danh sách đã hết hàng vẫn bắn đều
     * mỗi lần cuộn và mỗi lần lại là một lượt gọi mạng trả về mảng rỗng.
     */
    loadMore: () => {
      if (hasMore || moreError) void loadMore();
    },
  };
}
