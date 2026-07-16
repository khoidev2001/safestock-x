"use client";

import { RadioTower, Thermometer, WifiOff } from "lucide-react";
import type { SensorTimelineEvent, VirtualDevice } from "@/lib/dashboard-api";

interface SimulatorPanelProps {
  devices: VirtualDevice[] | undefined;
  timeline: SensorTimelineEvent[] | undefined;
  isLoading: boolean;
}

export function SimulatorPanel({ devices, timeline, isLoading }: SimulatorPanelProps) {
  if (isLoading) {
    return <div className="h-[360px] animate-pulse rounded-md border bg-[var(--surface)]" />;
  }

  const environmentDevices = (devices ?? []).filter((device) =>
    ["TEMPERATURE", "HUMIDITY", "GATEWAY", "POWER"].includes(device.type),
  );

  return (
    <section className="rounded-md border bg-[var(--surface)] p-5">
      <div className="flex items-center gap-2">
        <RadioTower aria-hidden="true" size={18} strokeWidth={1.8} />
        <div>
          <h2 className="text-sm font-semibold">Mô phỏng cảm biến</h2>
          <p className="text-xs text-[var(--text-muted)]">
            Dòng sự kiện gần nhất từ lớp thay thế IoT
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {environmentDevices.slice(0, 4).map((device) => (
          <div key={device.id} className="rounded-md border bg-[var(--surface-2)] p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold">{device.code}</span>
              {device.type === "GATEWAY" || device.type === "POWER" ? (
                <WifiOff aria-hidden="true" size={14} strokeWidth={1.8} />
              ) : (
                <Thermometer aria-hidden="true" size={14} strokeWidth={1.8} />
              )}
            </div>
            <p className="tabular mt-3 text-2xl font-semibold">
              {device.currentValue ?? "N/A"}
              <span className="ml-1 text-xs text-[var(--text-muted)]">{device.unit ?? ""}</span>
            </p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">{device.type}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 border-t pt-4">
        <h3 className="text-xs font-semibold text-[var(--text-muted)]">Timeline</h3>
        {(timeline?.length ?? 0) === 0 ? (
          <p className="mt-3 text-sm text-[var(--text-muted)]">
            Chưa có event. Chạy scenario hoặc kéo slider ở simulator backend.
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
                    {event.device.code} · {event.eventType}
                  </p>
                  <p className="tabular text-xs text-[var(--text-muted)]">
                    {event.value} {event.unit ?? ""} · {event.device.type}
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
