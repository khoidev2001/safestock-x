"use client";

import { ColorIcon } from "@/components/shared/color-icon";
import type { SensorTimelineEvent, VirtualDevice } from "@/lib/dashboard-api";

interface SimulatorPanelProps {
  devices: VirtualDevice[] | undefined;
  timeline: SensorTimelineEvent[] | undefined;
  isLoading: boolean;
}

const deviceTypeLabels: Record<string, string> = {
  TEMPERATURE: "Nhiệt độ",
  HUMIDITY: "Độ ẩm",
  GATEWAY: "Bộ kết nối",
  POWER: "Nguồn điện",
  LOADCELL: "Cân tải",
  DOOR: "Cửa kho",
  RFID_GATEWAY: "Cổng RFID",
  SMOKE: "Cảm biến khói",
  CAMERA_AI: "Camera AI",
};

const eventTypeLabels: Record<string, string> = {
  TEMP_READING: "Ghi nhận nhiệt độ",
  TEMPERATURE_HIGH: "Nhiệt độ vượt ngưỡng",
  HUMID_READING: "Ghi nhận độ ẩm",
  HUMIDITY_HIGH: "Độ ẩm vượt ngưỡng",
  WEIGHT_CHANGED: "Khối lượng thay đổi",
  SIGNAL_UNSTABLE: "Tín hiệu không ổn định",
  DOOR_OPEN: "Cửa được mở",
  DOOR_CLOSE: "Cửa đã đóng",
  RFID_DETECTED: "Phát hiện vật tư qua cổng RFID",
  GATEWAY_OFFLINE: "Bộ kết nối mất liên lạc",
  GATEWAY_ONLINE: "Bộ kết nối hoạt động trở lại",
  VISION_DETECTION: "Camera phát hiện thay đổi",
  SMOKE_READING: "Ghi nhận nồng độ khói",
  POWER_OFF: "Mất nguồn điện",
  POWER_ON: "Nguồn điện hoạt động trở lại",
};

const deviceCodeLabels: Record<string, string> = {
  temp: "Cảm biến nhiệt độ",
  humid: "Cảm biến độ ẩm",
  scale: "Cân tải kệ",
  door: "Cảm biến cửa",
  gateway: "Bộ kết nối",
  power: "Nguồn điện",
  smoke: "Cảm biến khói",
  rfid: "Cổng RFID",
  camera: "Camera",
};

function formatDeviceName(code: string, type: string): string {
  const [prefix, ...suffixParts] = code.split("_");
  const base = deviceCodeLabels[prefix.toLowerCase()] ?? deviceTypeLabels[type] ?? "Thiết bị";
  const suffix = suffixParts.join(" ");
  if (!suffix) return base;
  return `${base} ${suffix.toLowerCase() === "main" ? "chính" : suffix.toUpperCase()}`;
}

function formatEventDetail(event: SensorTimelineEvent): string {
  const deviceType = deviceTypeLabels[event.device.type] ?? "Thiết bị cảm biến";

  if (event.eventType === "SIGNAL_UNSTABLE" || event.unit === "quality") {
    const quality = event.value <= 1 ? event.value * 100 : event.value;
    return `Chất lượng tín hiệu ${Math.round(quality)}% · ${deviceType}`;
  }

  if (
    [
      "DOOR_OPEN",
      "DOOR_CLOSE",
      "GATEWAY_OFFLINE",
      "GATEWAY_ONLINE",
      "POWER_OFF",
      "POWER_ON",
    ].includes(event.eventType)
  ) {
    return deviceType;
  }

  return `${event.value}${event.unit ? ` ${event.unit}` : ""} · ${deviceType}`;
}

export function SimulatorPanel({ devices, timeline, isLoading }: SimulatorPanelProps) {
  if (isLoading) {
    return <div className="h-[360px] animate-pulse rounded-md border bg-[var(--surface)]" />;
  }

  if ((devices?.length ?? 0) === 0) {
    return (
      <section
        className="rounded-md border bg-[var(--surface)] p-5"
        role="status"
        aria-label="Trạng thái thiết bị IoT"
      >
        <div className="flex items-start gap-3">
          <ColorIcon name="simulator" size={20} tone="blue" />
          <div>
            <h2 className="text-sm font-semibold">Kho không triển khai thiết bị IoT</h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Tồn kho và tình trạng vật tư được cập nhật qua nghiệp vụ web/mobile.
            </p>
          </div>
        </div>
      </section>
    );
  }

  const environmentDevices = (devices ?? []).filter((device) =>
    ["TEMPERATURE", "HUMIDITY", "GATEWAY", "POWER"].includes(device.type),
  );

  return (
    <section className="rounded-md border bg-[var(--surface)] p-5">
      <div className="flex items-center gap-2">
        <ColorIcon name="simulator" size={20} tone="amber" />
        <div>
          <h2 className="text-sm font-semibold">Dữ liệu cảm biến</h2>
          <p className="text-xs text-[var(--text-muted)]">Số liệu thử nghiệm gần nhất của kho</p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {environmentDevices.slice(0, 4).map((device) => (
          <div key={device.id} className="rounded-md border bg-[var(--surface-2)] p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold">
                {formatDeviceName(device.code, device.type)}
              </span>
              {device.type === "GATEWAY" || device.type === "POWER" ? (
                <ColorIcon name="wifiOff" size={16} tone="red" />
              ) : (
                <ColorIcon name="temperature" size={16} tone="orange" />
              )}
            </div>
            <p className="tabular mt-3 text-2xl font-semibold">
              {device.currentValue ?? "--"}
              <span className="ml-1 text-xs text-[var(--text-muted)]">{device.unit ?? ""}</span>
            </p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              {deviceTypeLabels[device.type] ?? "Thiết bị cảm biến"}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-5 border-t pt-4">
        <h3 className="text-xs font-semibold text-[var(--text-muted)]">Diễn biến gần đây</h3>
        {(timeline?.length ?? 0) === 0 ? (
          <p className="mt-3 text-sm text-[var(--text-muted)]">
            Chưa ghi nhận dữ liệu thử nghiệm mới.
          </p>
        ) : (
          <ol className="mt-3 space-y-3">
            {timeline?.slice(0, 5).map((event) => (
              <li key={event.id} className="grid grid-cols-[72px_1fr] gap-3 text-sm">
                <time className="tabular text-xs text-[var(--text-muted)]">
                  {new Intl.DateTimeFormat("vi-VN", {
                    hour: "2-digit",
                    minute: "2-digit",
                  }).format(new Date(event.createdAt))}
                </time>
                <div>
                  <p className="font-medium">
                    {formatDeviceName(event.device.code, event.device.type)} ·{" "}
                    {eventTypeLabels[event.eventType] ?? "Cập nhật cảm biến"}
                  </p>
                  <p className="tabular text-xs text-[var(--text-muted)]">
                    {formatEventDetail(event)}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
