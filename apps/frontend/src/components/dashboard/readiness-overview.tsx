"use client";

import { AlertTriangle, Ban, CheckCircle2, RefreshCw } from "lucide-react";
import type { OperationalStatus, WarehouseReadiness } from "@/lib/dashboard-api";
import {
  getComponentLabel,
  getOperationalStatusColor,
  getOperationalStatusLabel,
} from "./readiness-status";

interface ReadinessOverviewProps {
  readiness: WarehouseReadiness | null | undefined;
  isLoading: boolean;
  isError: boolean;
  onRefresh: () => void;
  isRefreshing: boolean;
}

export function ReadinessOverview(props: ReadinessOverviewProps) {
  if (props.isLoading) return <ReadinessSkeleton />;
  if (props.isError) {
    return (
      <StatePanel
        icon={<AlertTriangle aria-hidden="true" size={18} />}
        title="Không tải được trạng thái kho"
        detail="Kiểm tra backend hoặc quyền readiness:view, rồi thử tải lại."
        onRefresh={props.onRefresh}
        isRefreshing={props.isRefreshing}
      />
    );
  }
  if (!props.readiness) {
    return (
      <StatePanel
        icon={<RefreshCw aria-hidden="true" size={18} />}
        title="Chưa đánh giá khả năng điều phối"
        detail="Tính lại để kiểm tra tồn kho, vị trí, kiểm kê, cảm biến và sự cố hiện tại."
        onRefresh={props.onRefresh}
        isRefreshing={props.isRefreshing}
      />
    );
  }

  const { readiness } = props;
  const tone = getOperationalStatusColor(readiness.operationalStatus);
  const actions = readiness.recommendedActions ?? [];

  return (
    <section className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(320px,0.8fr)_minmax(0,1.2fr)]">
        <div className="rounded-md border bg-[var(--surface)] p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <span className="mt-0.5" style={{ color: tone }}>
                <StatusIcon status={readiness.operationalStatus} />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase text-[var(--text-muted)]">
                  Khả năng vận hành kho
                </p>
                <h2 className="mt-1 text-xl font-semibold" style={{ color: tone }}>
                  {getOperationalStatusLabel(readiness.operationalStatus)}
                </h2>
              </div>
            </div>
            <span className="shrink-0 text-xs text-[var(--text-muted)]">
              Tham khảo {Math.round(readiness.referenceScore ?? readiness.score)}/100
            </span>
          </div>

          <div className="mt-5 border-t pt-4">
            {readiness.blockers.length > 0 ? (
              <div className="space-y-3">
                {readiness.blockers.map((blocker) => (
                  <div key={blocker.code}>
                    <p className="text-sm font-semibold">{blocker.title}</p>
                    <p className="mt-1 text-sm text-[var(--text-muted)]">
                      {blocker.reasons.join(" ") || "Cần xác minh tại kho."}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-[var(--text-muted)]">
                Không có điều kiện nào đang khóa việc điều phối.
              </p>
            )}
          </div>

          <div className="mt-5 flex items-center justify-between gap-3 border-t pt-4">
            <span className="text-xs text-[var(--text-muted)]">
              {formatUpdatedAt(readiness.computedAt)}
            </span>
            <RefreshButton compact {...props} />
          </div>
        </div>

        <div className="rounded-md border bg-[var(--surface)] p-5">
          <h3 className="text-sm font-semibold">Việc cần làm</h3>
          {actions.length > 0 ? (
            <ol className="mt-4 space-y-3">
              {actions.map((action, index) => (
                <li className="flex gap-3 text-sm" key={`${action}-${index}`}>
                  <span className="tabular flex size-6 shrink-0 items-center justify-center rounded-md bg-[var(--surface-2)] text-xs font-semibold">
                    {index + 1}
                  </span>
                  <span className="pt-0.5">{action}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-3 text-sm text-[var(--text-muted)]">
              Chưa có hành động khắc phục bắt buộc.
            </p>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-md border bg-[var(--surface)]">
        <div className="border-b px-5 py-4">
          <h3 className="text-sm font-semibold">Bằng chứng theo 6 tiêu chí</h3>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Điểm dùng để theo dõi xu hướng, không tự quyết định khóa điều phối.
          </p>
        </div>
        <div className="divide-y">
          {readiness.dimensions.map((dimension) => (
            <div className="grid gap-2 px-5 py-3 md:grid-cols-[180px_150px_1fr]" key={dimension.key}>
              <div>
                <p className="text-sm font-medium">{getComponentLabel(dimension.key)}</p>
                <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                  Tham khảo {Math.round(dimension.referenceScore)}/100
                </p>
              </div>
              <StatusBadge status={dimension.status} />
              <p className="text-sm text-[var(--text-muted)]">
                {dimension.reasons[0] ?? dimension.recommendedAction ?? "Không ghi nhận vấn đề."}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function StatusIcon({ status }: { status: OperationalStatus }) {
  if (status === "READY") return <CheckCircle2 aria-hidden="true" size={24} />;
  if (status === "NOT_DISPATCHABLE") return <Ban aria-hidden="true" size={24} />;
  return <AlertTriangle aria-hidden="true" size={24} />;
}

function StatusBadge({ status }: { status: OperationalStatus }) {
  const tone = getOperationalStatusColor(status);
  return (
    <span className="h-fit w-fit rounded-md px-2 py-1 text-xs font-semibold" style={{ color: tone, background: `color-mix(in oklch, ${tone} 12%, transparent)` }}>
      {getOperationalStatusLabel(status)}
    </span>
  );
}

function StatePanel({ icon, title, detail, onRefresh, isRefreshing }: {
  icon: React.ReactNode; title: string; detail: string; onRefresh: () => void; isRefreshing: boolean;
}) {
  return (
    <section className="rounded-md border bg-[var(--surface)] p-5">
      <div className="flex items-center gap-2 text-sm font-semibold">{icon}{title}</div>
      <p className="mt-2 text-sm text-[var(--text-muted)]">{detail}</p>
      <div className="mt-4"><RefreshButton isRefreshing={isRefreshing} onRefresh={onRefresh} /></div>
    </section>
  );
}

function RefreshButton({ compact = false, isRefreshing, onRefresh }: {
  compact?: boolean; isRefreshing: boolean; onRefresh: () => void;
}) {
  return (
    <button className="inline-flex items-center gap-2 rounded-md border bg-[var(--surface)] px-3 py-2 text-sm font-medium hover:bg-[var(--surface-2)] disabled:opacity-60" disabled={isRefreshing} onClick={onRefresh} type="button">
      <RefreshCw aria-hidden="true" className={isRefreshing ? "animate-spin" : ""} size={compact ? 14 : 16} />
      {compact ? "Tính lại" : isRefreshing ? "Đang tính lại" : "Đánh giá lại"}
    </button>
  );
}

function formatUpdatedAt(value: string): string {
  return `Cập nhật ${new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }).format(new Date(value))}`;
}

function ReadinessSkeleton() {
  return <section className="h-[430px] animate-pulse rounded-md border bg-[var(--surface)]" aria-busy="true" />;
}
