"use client";

import { useQuery } from "@tanstack/react-query";
import { ListChecks } from "lucide-react";
import { useState } from "react";
import { getAuditLogs, type AuditLog } from "@/lib/dashboard-api";

const FILTERS = [
  { value: "", label: "Tất cả" },
  { value: "ItemBatch", label: "Vật tư" },
  { value: "Mission", label: "Nhiệm vụ" },
  { value: "Incident", label: "Sự cố" },
  { value: "LoanRecord", label: "Mượn-trả" },
];

export function AuditView() {
  const [entity, setEntity] = useState("");
  const query = useQuery({
    queryKey: ["audit", entity],
    queryFn: () => getAuditLogs(entity || undefined),
  });

  return (
    <section className="rounded-md border bg-[var(--surface)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
        <div className="flex items-center gap-2 font-semibold">
          <ListChecks size={18} /> Nhật ký hậu kiểm
        </div>
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setEntity(f.value)}
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
      ) : (query.data ?? []).length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-[var(--text-muted)]">
          Chưa có bản ghi hậu kiểm.
        </p>
      ) : (
        <div className="divide-y">
          {(query.data ?? []).map((log) => (
            <AuditRow key={log.id} log={log} />
          ))}
        </div>
      )}
    </section>
  );
}

function AuditRow({ log }: { log: AuditLog }) {
  return (
    <div className="flex items-start gap-3 px-5 py-3">
      <div className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: "var(--color-accent)" }} />
      <div className="min-w-0 flex-1">
        <p className="text-sm">
          <b>{log.action}</b> <span className="text-[var(--text-muted)]">· {log.entity}</span>
        </p>
        {log.entityId && (
          <p className="truncate text-xs text-[var(--text-muted)]">ID: {log.entityId}</p>
        )}
      </div>
      <p className="shrink-0 text-xs text-[var(--text-muted)]">
        {new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" }).format(
          new Date(log.createdAt),
        )}
      </p>
    </div>
  );
}
