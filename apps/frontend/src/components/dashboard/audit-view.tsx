"use client";

import { useQuery } from "@tanstack/react-query";
import { ColorIcon } from "@/components/shared/color-icon";
import { useState } from "react";
import { getAuditLogs, type AuditLog } from "@/lib/dashboard-api";
import { Pagination, usePagination } from "@/components/shared/pagination";

const FILTERS = [
  { value: "", label: "Tất cả" },
  { value: "ItemBatch", label: "Vật tư" },
  { value: "Mission", label: "Nhiệm vụ" },
  { value: "Incident", label: "Sự cố" },
  { value: "LoanRecord", label: "Mượn-trả" },
  { value: "MonthlyStockReport", label: "Báo cáo tháng" },
];

const entityLabels: Record<string, string> = {
  ItemBatch: "Lô vật tư",
  Mission: "Nhiệm vụ",
  Incident: "Sự cố",
  LoanRecord: "Phiếu mượn",
  MonthlyStockReport: "Báo cáo tháng",
};

function readableAction(value: string): string {
  return value.toLowerCase().replaceAll("_", " ");
}

export function AuditView() {
  const [entity, setEntity] = useState("");
  const query = useQuery({
    queryKey: ["audit", entity],
    queryFn: () => getAuditLogs(entity || undefined),
  });
  const logs = query.data ?? [];
  const pagination = usePagination(logs);

  return (
    <section className="rounded-md border bg-[var(--surface)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
        <div className="flex items-center gap-2 font-semibold">
          <ColorIcon name="audit" size={20} tone="amber" /> Nhật ký thay đổi
        </div>
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => {
                setEntity(f.value);
                pagination.setPage(1);
              }}
              className="rounded-full px-3 py-1 text-xs font-medium transition active:translate-y-px"
              style={{
                background: entity === f.value ? "var(--color-accent)" : "var(--surface-2)",
                color: entity === f.value ? "var(--color-accent-fg)" : "var(--text-muted)",
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {query.isLoading ? (
        <div className="h-72 animate-pulse" aria-busy="true" />
      ) : query.isError ? (
        <div className="px-5 py-10 text-center">
          <p className="text-sm font-semibold text-[var(--color-critical)]">
            Không tải được nhật ký
          </p>
          <button className="mt-3 rounded-md border px-3 py-1.5 text-sm" onClick={() => void query.refetch()}>
            Tải lại
          </button>
        </div>
      ) : logs.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-[var(--text-muted)]">
          Chưa có bản ghi hậu kiểm.
        </p>
      ) : (
        <div className="divide-y">
          {pagination.pageItems.map((log) => (
            <AuditRow key={log.id} log={log} />
          ))}
        </div>
      )}
      <Pagination
        onPageChange={pagination.setPage}
        page={pagination.page}
        pageSize={pagination.pageSize}
        totalItems={logs.length}
        totalPages={pagination.totalPages}
      />
    </section>
  );
}

function AuditRow({ log }: { log: AuditLog }) {
  return (
    <div className="flex items-start gap-3 px-5 py-3">
      <div
        className="mt-1 h-2 w-2 shrink-0 rounded-full"
        style={{ background: "var(--color-accent)" }}
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm">
          <b className="capitalize">{readableAction(log.action)}</b>{" "}
          <span className="text-[var(--text-muted)]">
            · {entityLabels[log.entity] ?? log.entity}
          </span>
        </p>
        {log.entityId && (
          <p className="truncate text-xs text-[var(--text-muted)]">Mã bản ghi: {log.entityId}</p>
        )}
        <p className="truncate text-xs text-[var(--text-muted)]">
          Người thực hiện: {log.actor?.fullName ?? log.actorId ?? "Hệ thống"}
        </p>
        <AuditMetadata metadata={log.metadata} />
      </div>
      <p className="shrink-0 text-xs text-[var(--text-muted)]">
        {new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" }).format(
          new Date(log.createdAt),
        )}
      </p>
    </div>
  );
}

function AuditMetadata({ metadata }: { metadata: unknown }) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const value = metadata as Record<string, unknown>;
  const reason =
    typeof value.reason === "string"
      ? value.reason
      : typeof value.note === "string"
        ? value.note
        : null;
  const before =
    typeof value.before === "number"
      ? value.before
      : typeof value.beforeStatus === "string"
        ? value.beforeStatus
        : null;
  const after =
    typeof value.after === "number"
      ? value.after
      : typeof value.afterStatus === "string"
        ? value.afterStatus
        : null;
  const quantity = typeof value.quantity === "number" ? value.quantity : null;

  if (!reason && before === null && after === null && quantity === null) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-[var(--text-muted)]">
      {before !== null || after !== null ? (
        <span>Trước/sau: {String(before ?? "—")} → {String(after ?? "—")}</span>
      ) : null}
      {quantity !== null ? <span>Số lượng: {quantity}</span> : null}
      {reason ? <span className="basis-full">Lý do: {reason}</span> : null}
    </div>
  );
}
