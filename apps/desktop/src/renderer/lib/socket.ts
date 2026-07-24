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
  onConnectError?: (message: string) => void;
  onDisconnect?: () => void;
  onSensorEvent?: (payload: SensorEventPayload) => void;
  onNotification?: (payload: NotificationPayload) => void;
}

export function connectSocket(
  base: string,
  getToken: () => string | null,
  getSessionVersion: () => number,
  refreshToken: () => Promise<boolean>,
  handlers: SocketHandlers,
): Socket {
  const sessionVersion = getSessionVersion();
  let refreshAttempted = false;
  const socket = io(base, {
    transports: ["websocket"],
    auth: (callback) => {
      const token = getToken();
      callback(token ? { token } : {});
    },
  });

  socket.on("connect", () => {
    refreshAttempted = false;
    handlers.onConnect?.();
  });
  socket.on("connect_error", async (error) => {
    handlers.onConnectError?.(error.message);
    if (error.message !== "Unauthorized" || refreshAttempted) return;
    refreshAttempted = true;
    const rejectedToken = getToken();
    const refreshed = await refreshToken();
    if (getSessionVersion() !== sessionVersion) return;
    if (refreshed || (getToken() && getToken() !== rejectedToken)) socket.connect();
  });
  socket.on("disconnect", () => handlers.onDisconnect?.());
  if (handlers.onSensorEvent) socket.on("sensor_event", handlers.onSensorEvent);
  if (handlers.onNotification) socket.on("notification", handlers.onNotification);

  return socket;
}
