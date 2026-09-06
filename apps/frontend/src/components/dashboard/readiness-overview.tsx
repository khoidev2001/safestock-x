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
      {/*
        KHÔNG có khối "Kết luận hiện tại" ở đây nữa.

        Nó từng nói ba thứ, và cả ba đều đã có chỗ khác trên cùng trang này: điểm
        chặn điều phối nằm ở dải đỏ đầu trang (đầy đủ hơn, kèm lý do), còn kết
        luận và chỉ số theo dõi thì bảng sáu tiêu chí ngay dưới đây tự nói ra —
        mỗi tiêu chí kèm trạng thái riêng, chi tiết hơn hẳn một dòng tổng.

        Nút cập nhật và mốc thời gian tính toán theo về bảng ấy: đó mới là thứ
        thật sự đổi sau khi bấm.
      */}
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
          <p className="mt-3 text-sm text-[var(--text-muted)]">Chưa có việc bắt buộc phải xử lý.</p>
        )}
      </div>

      <div className="app-panel overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3 border-b px-5 py-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h3 className="text-sm font-semibold">Chi tiết theo 6 tiêu chí</h3>
              {/* Kết luận chung và chỉ số gộp về đây, cạnh chính bảng sinh ra
                  chúng — đọc một dòng tổng rồi mới xuống từng tiêu chí. */}
              <span className="text-sm font-semibold" style={{ color: tone }}>
                {getOperationalStatusLabel(readiness.operationalStatus)}
              </span>
              <span className="tabular text-xs text-[var(--text-muted)]">
                Chỉ số theo dõi {Math.round(readiness.referenceScore ?? readiness.score)}/100
              </span>
            </div>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Chỉ số giúp theo dõi biến động; kết luận điều phối luôn đi kèm lý do cụ thể.
            </p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              {formatUpdatedAt(readiness.computedAt)}
            </p>
          </div>
          <RefreshButton compact {...props} />
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
