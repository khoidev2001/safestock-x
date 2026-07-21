"use client";

import { ColorIcon } from "@/components/shared/color-icon";
import type { IncidentSummary, InventoryBatch, WarehouseReadiness } from "@/lib/dashboard-api";
import { getOperationalStatusLabel } from "./readiness-status";

interface OperationsSummaryProps {
  readiness: WarehouseReadiness | null | undefined;
  batches: InventoryBatch[] | undefined;
  incidents: IncidentSummary[] | undefined;
}

export function OperationsSummary({ readiness, batches, incidents }: OperationsSummaryProps) {
  const lowQuantity = (batches ?? []).filter((batch) => batch.quantity <= 10).length;
  const recommendation = readiness?.recommendedActions?.[0] ?? readiness?.recommendations?.[0]?.message;
  const blocker = readiness?.blockers?.[0];

  return (
    <section className="grid gap-3 md:grid-cols-4">
      <MetricCard
        icon={<ColorIcon name="readiness" size={19} tone="green" />}
        label="Khả năng điều phối"
        value={readiness ? getOperationalStatusLabel(readiness.operationalStatus) : "Chưa đánh giá"}
        note={blocker?.title ?? "Không có vướng mắc cản trở điều phối"}
      />
      <MetricCard
        icon={<ColorIcon name="packageSearch" size={19} tone="orange" />}
        label="Lô còn ít"
        value={String(lowQuantity)}
        note="Các lô còn từ 10 đơn vị trở xuống"
      />
      <MetricCard
        icon={<ColorIcon name="incident" size={19} tone="red" />}
        label="Sự cố mở"
        value={String(incidents?.length ?? 0)}
        note="Sự cố chưa được xử lý xong"
      />
      <MetricCard
        icon={<ColorIcon name="workflow" size={19} tone="blue" />}
        label="Việc cần làm"
        value={recommendation ? "Có việc cần làm" : "Ổn định"}
        note={recommendation ?? "Chưa phát sinh việc cần xử lý"}
      />
    </section>
  );
}

function MetricCard({
  icon,
  label,
  value,
  note,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="app-panel border-t-2 p-4" style={{ borderTopColor: "var(--color-accent)" }}>
      <div className="flex items-center gap-2 text-xs font-medium text-[var(--text-muted)]">
        {icon}
        {label}
      </div>
      <p className="mt-3 truncate text-lg font-semibold">{value}</p>
      <p className="mt-1 line-clamp-2 text-xs text-[var(--text-muted)]">{note}</p>
    </div>
  );
}
