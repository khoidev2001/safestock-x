"use client";

import { AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { WarehouseReadiness } from "@/lib/dashboard-api";
import { getComponentLabel, getZoneColor, getZoneLabel, getReadinessZone } from "./readiness-status";

interface ReadinessOverviewProps {
  readiness: WarehouseReadiness | null | undefined;
  isLoading: boolean;
  isError: boolean;
  onRefresh: () => void;
  isRefreshing: boolean;
}

export function ReadinessOverview({
  readiness,
  isLoading,
  isError,
  onRefresh,
  isRefreshing,
}: ReadinessOverviewProps) {
  if (isLoading) return <ReadinessSkeleton />;

  if (isError) {
    return (
      <section className="rounded-md border bg-[var(--surface)] p-5">
        <StateHeader
          icon={<AlertTriangle aria-hidden="true" size={18} strokeWidth={1.8} />}
          title="Không tải được Readiness"
          tone="var(--color-critical)"
        />
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          Kiểm tra backend hoặc quyền `readiness:view`, rồi thử tải lại.
        </p>
        <RefreshButton isRefreshing={isRefreshing} onRefresh={onRefresh} />
      </section>
    );
  }

  if (!readiness) {
    return (
      <section className="rounded-md border bg-[var(--surface)] p-5">
        <StateHeader
          icon={<RefreshCw aria-hidden="true" size={18} strokeWidth={1.8} />}
          title="Chưa có điểm Readiness"
          tone="var(--color-accent)"
        />
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          Bấm tính lại để backend gom tồn kho, kiểm kê và cảm biến hiện tại.
        </p>
        <RefreshButton isRefreshing={isRefreshing} onRefresh={onRefresh} />
      </section>
    );
  }

  const zone = readiness.zone ?? getReadinessZone(readiness.score);
  const chartData = readiness.components.map((component) => ({
    name: getComponentLabel(component.key),
    score: Math.round(component.value),
  }));

  return (
    <section className="grid gap-4 lg:grid-cols-[360px_1fr]">
      <div className="rounded-md border bg-[var(--surface)] p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-[var(--text-muted)]">Readiness toàn kho</p>
            <div className="mt-3 flex items-end gap-2">
              <span className="tabular text-6xl font-semibold leading-none">
                {Math.round(readiness.score)}
              </span>
              <span className="pb-2 text-sm text-[var(--text-muted)]">/100</span>
            </div>
          </div>
          <span
            className="rounded-md px-2.5 py-1 text-xs font-semibold"
            style={{
              background: `color-mix(in oklch, ${getZoneColor(zone)} 15%, transparent)`,
              color: getZoneColor(zone),
            }}
          >
            {getZoneLabel(zone)}
          </span>
        </div>

        <div className="mt-5 h-2 overflow-hidden rounded-md bg-[var(--surface-2)]">
          <div
            className="h-full rounded-md"
            style={{ width: `${Math.min(readiness.score, 100)}%`, background: getZoneColor(zone) }}
          />
        </div>

        <div className="mt-5 flex items-center justify-between gap-3 border-t pt-4 text-xs text-[var(--text-muted)]">
          <span>
            Cập nhật{" "}
            {new Intl.DateTimeFormat("vi-VN", {
              hour: "2-digit",
              minute: "2-digit",
              day: "2-digit",
              month: "2-digit",
            }).format(new Date(readiness.computedAt))}
          </span>
          <RefreshButton compact isRefreshing={isRefreshing} onRefresh={onRefresh} />
        </div>
      </div>

      <div className="rounded-md border bg-[var(--surface)] p-5">
        <div className="flex items-center justify-between gap-3">
          <StateHeader
            icon={<CheckCircle2 aria-hidden="true" size={18} strokeWidth={1.8} />}
            title="6 thành phần điểm"
            tone="var(--color-accent)"
          />
        </div>
        <div className="mt-4 h-[260px]">
          <ResponsiveContainer height="100%" width="100%">
            <BarChart data={chartData} margin={{ top: 8, right: 12, left: -20, bottom: 52 }}>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis
                angle={-24}
                dataKey="name"
                height={58}
                interval={0}
                stroke="var(--text-muted)"
                textAnchor="end"
                tick={{ fontSize: 11 }}
              />
              <YAxis domain={[0, 100]} stroke="var(--text-muted)" tick={{ fontSize: 11 }} />
              <Tooltip
                contentStyle={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  color: "var(--text)",
                }}
              />
              <Bar dataKey="score" fill="var(--color-accent)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </section>
  );
}

function StateHeader({
  icon,
  title,
  tone,
}: {
  icon: React.ReactNode;
  title: string;
  tone: string;
}) {
  return (
    <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: tone }}>
      {icon}
      <span>{title}</span>
    </div>
  );
}

function RefreshButton({
  compact = false,
  isRefreshing,
  onRefresh,
}: {
  compact?: boolean;
  isRefreshing: boolean;
  onRefresh: () => void;
}) {
  return (
    <button
      className="inline-flex items-center gap-2 rounded-md border bg-[var(--surface)] px-3 py-2 text-sm font-medium transition hover:bg-[var(--surface-2)] active:translate-y-px disabled:opacity-60"
      disabled={isRefreshing}
      onClick={onRefresh}
      type="button"
    >
      <RefreshCw
        aria-hidden="true"
        className={isRefreshing ? "animate-spin" : ""}
        size={compact ? 14 : 16}
        strokeWidth={1.8}
      />
      {compact ? "Tính lại" : isRefreshing ? "Đang tính lại" : "Tính lại readiness"}
    </button>
  );
}

function ReadinessSkeleton() {
  return (
    <section className="grid gap-4 lg:grid-cols-[360px_1fr]" aria-busy="true">
      <div className="h-[242px] animate-pulse rounded-md border bg-[var(--surface)]" />
      <div className="h-[342px] animate-pulse rounded-md border bg-[var(--surface)]" />
    </section>
  );
}
