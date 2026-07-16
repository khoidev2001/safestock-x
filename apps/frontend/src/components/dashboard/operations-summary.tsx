"use client";

import { AlertTriangle, ClipboardList, Gauge, PackageSearch } from "lucide-react";
import type { IncidentSummary, InventoryBatch, WarehouseReadiness } from "@/lib/dashboard-api";
import { getComponentLabel } from "./readiness-status";

interface OperationsSummaryProps {
  readiness: WarehouseReadiness | null | undefined;
  batches: InventoryBatch[] | undefined;
  incidents: IncidentSummary[] | undefined;
}

export function OperationsSummary({ readiness, batches, incidents }: OperationsSummaryProps) {
  const lowQuantity = (batches ?? []).filter((batch) => batch.quantity <= 10).length;
  const recommendation = readiness?.recommendations?.[0];
  const weakestComponent = readiness?.components
    ? [...readiness.components].sort((a, b) => a.value - b.value)[0]
    : null;

  return (
    <section className="grid gap-3 md:grid-cols-4">
      <MetricCard
        icon={<Gauge aria-hidden="true" size={17} strokeWidth={1.8} />}
        label="Điểm nghẽn"
        value={weakestComponent ? getComponentLabel(weakestComponent.key) : "Chưa có"}
        note={weakestComponent ? `${Math.round(weakestComponent.value)}/100` : "Cần tính readiness"}
      />
      <MetricCard
        icon={<PackageSearch aria-hidden="true" size={17} strokeWidth={1.8} />}
        label="Lô sắp thiếu"
        value={String(lowQuantity)}
        note="Ngưỡng theo demo: <= 10 đơn vị"
      />
      <MetricCard
        icon={<AlertTriangle aria-hidden="true" size={17} strokeWidth={1.8} />}
        label="Sự cố mở"
        value={String(incidents?.length ?? 0)}
        note="Từ incident engine"
      />
      <MetricCard
        icon={<ClipboardList aria-hidden="true" size={17} strokeWidth={1.8} />}
        label="Khuyến nghị"
        value={recommendation ? getComponentLabel(recommendation.component) : "Ổn định"}
        note={recommendation?.message ?? "Chưa có đề xuất mới"}
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
    <div className="rounded-md border bg-[var(--surface)] p-4">
      <div className="flex items-center gap-2 text-xs font-medium text-[var(--text-muted)]">
        {icon}
        {label}
      </div>
      <p className="mt-3 truncate text-lg font-semibold">{value}</p>
      <p className="mt-1 line-clamp-2 text-xs text-[var(--text-muted)]">{note}</p>
    </div>
  );
}
