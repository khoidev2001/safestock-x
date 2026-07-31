import { useEffect, useRef } from "react";
import { io, type Socket } from "socket.io-client";
import { getAccessToken, getBase, getSessionVersion } from "./api";

interface RealtimeNotification {
  kind?: string;
  warehouseId?: string | null;
}

/**
 * Kênh realtime cho sự cố.
 *
 * Chỉ đóng vai trò ĐÁNH THỨC: server báo "kho này vừa có sự cố", renderer tải
 * lại danh sách rồi tự quyết định kéo chuông. Không tin nội dung gói tin để bật
 * chuông, vì trạng thái thật của sự cố nằm ở danh sách có thẩm quyền.
 *
 * Mất kết nối không làm mất cảnh báo: vòng polling hiện có vẫn phát hiện sự cố
 * mới, realtime chỉ rút thời gian chờ từ hàng chục giây xuống gần như tức thì.
 */
export function useIncidentStream(warehouseId: string | null, onIncidentSignal: () => void): void {
  const handlerRef = useRef(onIncidentSignal);
  useEffect(() => {
    handlerRef.current = onIncidentSignal;
  }, [onIncidentSignal]);
  const sessionVersion = getSessionVersion();

  useEffect(() => {
    const token = getAccessToken();
    if (!warehouseId || !token) return;

    let socket: Socket | null = null;
    try {
      socket = io(getBase(), {
        transports: ["websocket"],
        // Hàm, không phải giá trị chụp sẵn: access token sống 15 phút, nên lần
        // nối lại sau khi mạng chớp phải lấy token mới chứ không dùng bản cũ đã
        // hết hạn — nếu không, kênh realtime chết vĩnh viễn sau lần rớt đầu tiên.
        auth: (callback: (data: Record<string, unknown>) => void) =>
          callback({ token: getAccessToken() ?? "" }),
        reconnectionDelay: 1_000,
        reconnectionDelayMax: 10_000,
      });
    } catch {
      // Không dựng được kênh realtime thì vẫn còn polling; không chặn app.
      return;
    }

    const onNotification = (payload: RealtimeNotification) => {
      if (payload?.kind !== "INCIDENT_DETECTED") return;
      if (payload.warehouseId && payload.warehouseId !== warehouseId) return;
      handlerRef.current();
    };

    socket.on("notification", onNotification);
    return () => {
      socket?.off("notification", onNotification);
      socket?.disconnect();
    };
    // sessionVersion: token mới sau khi refresh/đăng nhập lại cần nối lại kênh.
  }, [warehouseId, sessionVersion]);
}
