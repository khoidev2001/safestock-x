"use client";

import { CollapsiblePanel } from "@/components/shared/collapsible-panel";
import { ColorIcon } from "@/components/shared/color-icon";
import { SENSOR_EVENT_LABEL } from "@/lib/incident-labels";
import type { SensorTimelineEvent, VirtualDevice } from "@/lib/dashboard-api";

interface SimulatorPanelProps {
  devices: VirtualDevice[] | undefined;
  timeline: SensorTimelineEvent[] | undefined;
  isLoading: boolean;
  /**
   * Dòng thời gian "Diễn biến gần đây".
   *
   * Tắt được vì trang tổng quan đọc theo chiều "kho đang thế nào ngay lúc này":
   * năm dòng ghi nhận nồng độ khói cách nhau vài phút là nhật ký thiết bị, thuộc
   * về trang mô phỏng cảm biến — ở đây nó chỉ đẩy bản đồ và các khối khác xuống.
   */
  showTimeline?: boolean;
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

/** Mỗi loại một biểu tượng riêng: 19 ô giống hệt nhau thì phải đọc từng chữ mới phân biệt được. */
function deviceIconName(type: string) {
  if (type === "TEMPERATURE") return "temperature" as const;
  if (type === "HUMIDITY") return "weather" as const;
  if (type === "SMOKE") return "warning" as const;
  if (type === "LOADCELL") return "inventory" as const;
  if (type === "DOOR" || type === "RFID_GATEWAY") return "warehouse" as const;
  if (type === "CAMERA_AI") return "simulator" as const;
  return "wifiOff" as const;
}

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

export function SimulatorPanel({
  devices,
  timeline,
  isLoading,
  showTimeline = true,
}: SimulatorPanelProps) {
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

  /**
   * Đúng danh sách app mô phỏng đang hiện, giữ nguyên thứ tự backend trả về.
   *
   * Trước đây khối này lọc còn bốn loại rồi `.slice(0, 4)` nên chỉ hiện 4 ô: cân
   * tải kệ và cảm biến khói biến mất, dù app cho chỉnh đủ. Hai màn hình ra hai bộ
   * số khác nhau thì không ai tin bên nào.
   *
   * Cửa, RFID, camera, nguồn và bộ kết nối không nằm trong danh sách vì app không
   * mô phỏng được chúng — hiện ở đây thì web lại có thứ app không có, vẫn là lệch.
   */
  const SIMULATED_TYPES = ["LOADCELL", "TEMPERATURE", "HUMIDITY", "SMOKE"];
  const environmentDevices = (devices ?? []).filter((device) =>
    SIMULATED_TYPES.includes(device.type),
  );

  return (
    <CollapsiblePanel
      className="rounded-md border bg-[var(--surface)] p-5"
      icon={<ColorIcon name="simulator" size={20} tone="amber" />}
      title="Dữ liệu cảm biến"
      subtitle={`Số liệu thử nghiệm gần nhất · ${environmentDevices.length} thiết bị`}
    >
      {/* auto-fill: 19 thiết bị phải vừa cột hẹp lẫn màn rộng mà không cần đoán
          breakpoint. Ô nào chưa có số đo thì làm mờ, để mắt bắt ngay cái đã có. */}
      <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(150px,1fr))]">
        {environmentDevices.map((device) => (
          <div
            key={device.id}
            className="rounded-md border bg-[var(--surface-2)] p-3"
            style={device.currentValue == null ? { opacity: 0.6 } : undefined}
          >
            <div className="flex items-start justify-between gap-2">
              <span className="text-xs font-semibold">
                {formatDeviceName(device.code, device.type)}
              </span>
              <ColorIcon name={deviceIconName(device.type)} size={16} tone="orange" />
            </div>
            <p className="tabular mt-3 text-xl font-semibold">
              {device.currentValue ?? "--"}
              <span className="ml-1 text-xs text-[var(--text-muted)]">{device.unit ?? ""}</span>
            </p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              {deviceTypeLabels[device.type] ?? "Thiết bị cảm biến"}
            </p>
          </div>
        ))}
      </div>

      {showTimeline ? (
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
                  }).format(new Date(event.observedAt))}
                </time>
                <div>
                  <p className="font-medium">
                    {formatDeviceName(event.device.code, event.device.type)} ·{" "}
                    {SENSOR_EVENT_LABEL[event.eventType] ?? "Cập nhật cảm biến"}
                  </p>
                  <p className="tabular text-xs text-[var(--text-muted)]">
                    {formatEventDetail(event)}
                  </p>
                  {event.submission && (
                    <p className="mt-1 text-xs text-[var(--text-muted)]">
                      Backend nhận:{" "}
                      {new Intl.DateTimeFormat("vi-VN", {
                        hour: "2-digit",
                        minute: "2-digit",
                      }).format(new Date(event.submission.receivedAt))}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
      ) : null}
    </CollapsiblePanel>
  );
}
