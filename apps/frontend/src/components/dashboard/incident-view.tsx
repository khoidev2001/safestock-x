"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ColorIcon } from "@/components/shared/color-icon";
import {
  acknowledgeIncident,
  getIncidents,
  resolveIncident,
  type IncidentSummary,
} from "@/lib/dashboard-api";
import { Pagination, usePagination } from "@/components/shared/pagination";

const SEVERITY: Record<string, { label: string; color: string }> = {
  LOW: { label: "Thấp", color: "var(--color-ready)" },
  MEDIUM: { label: "Trung bình", color: "var(--color-attention)" },
  HIGH: { label: "Cao", color: "var(--color-degraded)" },
  CRITICAL: { label: "Nghiêm trọng", color: "var(--color-critical)" },
};

const KIND_LABEL: Record<string, string> = {
  SUSPECTED_LOSS: "Nghi thất thoát",
  SENSOR_FAULT: "Lỗi cảm biến",
  BAD_STORAGE: "Bảo quản kém",
  FIRE_RISK: "Nghi cháy",
  POWER_OUTAGE: "Mất điện",
  STAT_ANOMALY: "Bất thường cảm biến",
  PREDICTIVE_WARNING: "Cảnh báo sớm",
};

export function IncidentView({ warehouseId }: { warehouseId: string }) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["incidents-all", warehouseId],
    queryFn: () => getIncidents(warehouseId),
    enabled: Boolean(warehouseId),
    refetchInterval: 10000,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["incidents-all", warehouseId] });
  const ack = useMutation({ mutationFn: acknowledgeIncident, onSuccess: invalidate });
  const resolve = useMutation({ mutationFn: (id: string) => resolveIncident(id), onSuccess: invalidate });

  const incidents = query.data ?? [];
  const pagination = usePagination(incidents);

  if (query.isLoading) return <Skeleton />;

  if (incidents.length === 0) {
    return (
      <section className="rounded-md border bg-[var(--surface)] p-10 text-center">
        <ColorIcon className="mx-auto" name="success" size={30} tone="green" />
        <p className="mt-3 font-medium">Không có sự cố</p>
        <p className="mt-1 text-sm text-[var(--text-muted)]">Kho đang vận hành bình thường.</p>
      </section>
    );
  }

  return (
    <div>
      <div className="space-y-3">
        {pagination.pageItems.map((inc) => (
          <IncidentCard
            key={inc.id}
            incident={inc}
            onAck={() => ack.mutate(inc.id)}
            onResolve={() => resolve.mutate(inc.id)}
            busy={ack.isPending || resolve.isPending}
          />
        ))}
      </div>
      <Pagination
        onPageChange={pagination.setPage}
        page={pagination.page}
        pageSize={pagination.pageSize}
        totalItems={incidents.length}
        totalPages={pagination.totalPages}
      />
    </div>
  );
}

function IncidentCard({
  incident,
  onAck,
  onResolve,
  busy,
}: {
  incident: IncidentSummary;
  onAck: () => void;
  onResolve: () => void;
  busy: boolean;
}) {
  const sev = SEVERITY[incident.severity] ?? SEVERITY.MEDIUM;
  const isOpen = incident.state === "OPEN";
  const isResolved = incident.state === "RESOLVED";
  const explanation = incident.explanation ?? null;

  return (
    <section
      className="rounded-md border bg-[var(--surface)] p-4"
      style={{ borderLeftWidth: 3, borderLeftColor: sev.color }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex gap-3">
          <ColorIcon className="mt-0.5" name="incident" size={22} tone="red" />
          <div>
            <p className="font-semibold">{incident.title}</p>
            <p className="mt-0.5 text-sm text-[var(--text-muted)]">
              {KIND_LABEL[incident.kind] ?? incident.kind} · độ tin cậy{" "}
              {Math.round(incident.confidence * 100)}%
            </p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              {new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" }).format(
                new Date(incident.detectedAt),
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="rounded-md px-2.5 py-1 text-xs font-semibold"
            style={{ background: `color-mix(in oklch, ${sev.color} 15%, transparent)`, color: sev.color }}
          >
            {sev.label}
          </span>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3">
        <span className="text-xs font-medium text-[var(--text-muted)]">
          Trạng thái: {isResolved ? "Đã xử lý" : isOpen ? "Chưa xử lý" : "Đang xử lý"}
        </span>
        {!isResolved && (
          <div className="flex gap-2">
            {isOpen && (
              <button
                onClick={onAck}
                disabled={busy}
                className="rounded-md border px-3 py-1.5 text-xs font-medium transition hover:bg-[var(--surface-2)] active:translate-y-px disabled:opacity-60"
              >
                Tiếp nhận
              </button>
            )}
            <button
              onClick={onResolve}
              disabled={busy}
              className="rounded-md px-3 py-1.5 text-xs font-semibold text-[var(--color-accent-fg)] transition active:translate-y-px disabled:opacity-60"
              style={{ background: "var(--color-accent)" }}
            >
              Đánh dấu đã xử lý
            </button>
          </div>
        )}
      </div>

      {/* Giải thích AI tự sinh khi sự cố mới bật (backend enrich). */}
      {explanation && (
        <div
          className="mt-3 flex items-start gap-2 rounded-md p-3"
          style={{ background: "color-mix(in oklch, #7c3aed 10%, transparent)", border: "1px solid color-mix(in oklch, #7c3aed 35%, transparent)" }}
        >
          <span
            className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide text-white"
            style={{ background: "#7c3aed" }}
          >
            AI
          </span>
          <p className="text-sm leading-relaxed">{explanation}</p>
        </div>
      )}
    </section>
  );
}

function Skeleton() {
  return (
    <div className="space-y-3" aria-busy="true">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-24 animate-pulse rounded-md border bg-[var(--surface)]" />
      ))}
    </div>
  );
}
