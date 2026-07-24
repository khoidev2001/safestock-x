"use client";

import { ColorIcon } from "@/components/shared/color-icon";
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
        icon={<ColorIcon name="warning" size={20} tone="red" />}
        title="Không tải được trạng thái kho"
        detail="Kết nối dữ liệu đang gián đoạn. Vui lòng thử lại sau ít phút."
        onRefresh={props.onRefresh}
        isRefreshing={props.isRefreshing}
      />
    );
  }
  if (!props.readiness) {
    return (
      <StatePanel
        icon={<ColorIcon name="refresh" size={20} tone="blue" />}
        title="Chưa có kết quả kiểm tra"
        detail="Kiểm tra ngay để đối chiếu tồn kho, chất lượng, hạn dùng và các sự cố hiện tại."
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
        <div className="app-panel p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <span className="mt-0.5" style={{ color: tone }}>
                <StatusIcon status={readiness.operationalStatus} />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-medium text-[var(--text-muted)]">Kết luận hiện tại</p>
                <h2 className="mt-1 text-xl font-semibold" style={{ color: tone }}>
                  {getOperationalStatusLabel(readiness.operationalStatus)}
                </h2>
              </div>
            </div>
            <span className="shrink-0 text-xs text-[var(--text-muted)]">
              Chỉ số theo dõi {Math.round(readiness.referenceScore ?? readiness.score)}/100
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
                Chưa ghi nhận vấn đề nào ngăn cản việc điều phối.
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

        <div className="app-panel p-5">
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
              Chưa có việc bắt buộc phải xử lý.
            </p>
          )}
        </div>
      </div>

      <div className="app-panel overflow-hidden">
        <div className="border-b px-5 py-4">
          <h3 className="text-sm font-semibold">Chi tiết theo 6 tiêu chí</h3>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Chỉ số giúp theo dõi biến động; kết luận điều phối luôn đi kèm lý do cụ thể.
          </p>
        </div>
        <div className="divide-y">
          {readiness.dimensions.map((dimension) => (
            <div
              className="grid gap-2 px-5 py-3 md:grid-cols-[180px_150px_1fr]"
              key={dimension.key}
            >
              <div>
                <p className="text-sm font-medium">{getComponentLabel(dimension.key)}</p>
                <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                  Chỉ số {Math.round(dimension.referenceScore)}/100
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
  if (status === "READY") return <ColorIcon name="success" size={26} tone="green" />;
  if (status === "NOT_DISPATCHABLE") return <ColorIcon name="blocked" size={26} tone="red" />;
  return <ColorIcon name="warning" size={26} tone="amber" />;
}

function StatusBadge({ status }: { status: OperationalStatus }) {
  const tone = getOperationalStatusColor(status);
  return (
    <span
      className="h-fit w-fit rounded-md px-2 py-1 text-xs font-semibold"
      style={{ color: tone, background: `color-mix(in oklch, ${tone} 12%, transparent)` }}
    >
      {getOperationalStatusLabel(status)}
    </span>
  );
}

function StatePanel({
  icon,
  title,
  detail,
  onRefresh,
  isRefreshing,
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
  onRefresh: () => void;
  isRefreshing: boolean;
}) {
  return (
    <section className="rounded-md border bg-[var(--surface)] p-5">
      <div className="flex items-center gap-2 text-sm font-semibold">
        {icon}
        {title}
      </div>
      <p className="mt-2 text-sm text-[var(--text-muted)]">{detail}</p>
      <div className="mt-4">
        <RefreshButton isRefreshing={isRefreshing} onRefresh={onRefresh} />
      </div>
    </section>
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
      className="inline-flex items-center gap-2 rounded-md border bg-[var(--surface)] px-3 py-2 text-sm font-medium hover:bg-[var(--surface-2)] disabled:opacity-60"
      disabled={isRefreshing}
      onClick={onRefresh}
      type="button"
    >
      <ColorIcon
        className={isRefreshing ? "animate-spin" : ""}
        name="refresh"
        size={compact ? 16 : 18}
        tone="blue"
      />
      {compact ? "Cập nhật" : isRefreshing ? "Đang kiểm tra" : "Kiểm tra lại"}
    </button>
  );
}

function formatUpdatedAt(value: string): string {
  return `Cập nhật ${new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }).format(new Date(value))}`;
}

function ReadinessSkeleton() {
  return (
    <section
      className="h-[430px] animate-pulse rounded-md border bg-[var(--surface)]"
      aria-busy="true"
    />
  );
}
