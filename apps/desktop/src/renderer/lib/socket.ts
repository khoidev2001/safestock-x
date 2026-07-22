// Kết nối WebSocket tới backend (KHÔNG cần token — gateway không xác thực handshake).
//  - join room "wh:{warehouseId}" → nhận "sensor_event" (chỉ scenario runner phát).
//  - join room "role:ADMIN" → nhận "notification" (cảnh báo sự cố INCIDENT_DETECTED).
// Mẫu: apps/frontend/src/components/mission/notification-bell.tsx.
import { io, type Socket } from "socket.io-client";

export interface SensorEventPayload {
  deviceCode?: string;
  eventType?: string;
  value?: number;
  unit?: string;
  [key: string]: unknown;
}

export interface NotificationPayload {
  kind?: string;
  title?: string;
  body?: string;
  [key: string]: unknown;
}

export interface SocketHandlers {
  onConnect?: () => void;
  onDisconnect?: () => void;
  onSensorEvent?: (payload: SensorEventPayload) => void;
  onNotification?: (payload: NotificationPayload) => void;
}

export function connectSocket(
  base: string,
  warehouseId: string,
  role: string,
  handlers: SocketHandlers,
): Socket {
  const socket = io(base, { transports: ["websocket"] });

  socket.on("connect", () => {
    socket.emit("join", { warehouseId });
    socket.emit("join-role", { role });
    handlers.onConnect?.();
  });
  socket.on("disconnect", () => handlers.onDisconnect?.());
  if (handlers.onSensorEvent) socket.on("sensor_event", handlers.onSensorEvent);
  if (handlers.onNotification) socket.on("notification", handlers.onNotification);

  return socket;
}
