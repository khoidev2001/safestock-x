"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ColorIcon } from "@/components/shared/color-icon";
import { useRef, useState } from "react";
import { useAuth } from "@/lib/auth-store";
import {
  approveReport,
  listReports,
  rejectReport,
  uploadReport,
  type StockReport,
} from "@/lib/report-api";
import { Pagination, usePagination } from "@/components/shared/pagination";

/** Báo cáo kiểm kê tháng: trưởng thôn gửi tệp, quản trị xã duyệt và cập nhật kho. */
export function ReportView({ warehouseId }: { warehouseId: string }) {
  const role = useAuth((s) => s.user?.role);
  const scopeWarehouseId = useAuth((s) => s.user?.warehouseId);
  const isAdmin = role === "ADMIN";

  return (
    <div className="space-y-4">
      {!isAdmin && <UploadCard warehouseId={scopeWarehouseId ?? warehouseId} />}
      <ReportList isAdmin={isAdmin} />
    </div>
  );
}

function UploadCard({ warehouseId }: { warehouseId: string }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [period, setPeriod] = useState(() => new Date().toISOString().slice(0, 7));
  const [msg, setMsg] = useState<string | null>(null);

  const upload = useMutation({
    mutationFn: () => uploadReport(warehouseId, period, file as File),
    onSuccess: () => {
      setMsg("Đã gửi báo cáo, chờ cơ quan xã duyệt.");
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      qc.invalidateQueries({ queryKey: ["reports"] });
    },
    onError: (e) => setMsg(e instanceof Error ? e.message : "Chưa thể gửi báo cáo. Vui lòng thử lại."),
  });

  return (
    <section className="rounded-md border bg-[var(--surface)] p-5">
      <div className="flex items-center gap-2 text-sm font-semibold text-[var(--color-accent)]">
        <ColorIcon name="report" size={20} tone="green" />
        <span>Gửi báo cáo kiểm kê tháng</span>
      </div>
      <p className="mt-1 text-sm text-[var(--text-muted)]">
        Đính kèm bảng kiểm kê gồm 7 cột: mã vật tư, tên vật tư, số lượng, đơn vị, hạn dùng, tình trạng và ghi chú. Số liệu chỉ được cập nhật sau khi xã phê duyệt.
      </p>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-[var(--text-muted)]">Kỳ báo cáo</span>
          <input
            type="month"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="rounded-md border bg-[var(--surface)] px-3 py-2 text-sm"
          />
        </label>
        <label className="block flex-1">
          <span className="mb-1 block text-xs font-medium text-[var(--text-muted)]">Tệp Excel (.xlsx)</span>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-[var(--text-muted)] file:mr-3 file:rounded-md file:border-0 file:bg-[var(--surface-2)] file:px-3 file:py-2 file:text-sm file:font-medium"
          />
        </label>
        <button
          type="button"
          onClick={() => upload.mutate()}
          disabled={!file || upload.isPending}
          className="inline-flex items-center gap-2 rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-[var(--color-accent-fg)] transition hover:brightness-95 active:translate-y-px disabled:opacity-60"
        >
          <ColorIcon name="upload" size={18} tone="blue" />
          {upload.isPending ? "Đang gửi…" : "Gửi báo cáo"}
        </button>
      </div>
      {msg && <p className="mt-3 text-sm text-[var(--text-muted)]">{msg}</p>}
    </section>
  );
}

function ReportList({ isAdmin }: { isAdmin: boolean }) {
  const qc = useQueryClient();
  const reportsQuery = useQuery({
    queryKey: ["reports"],
    queryFn: () => listReports(),
    refetchInterval: 8000,
  });

  const act = useMutation({
    mutationFn: (fn: () => Promise<unknown>) => fn(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reports"] }),
  });

  const reports = reportsQuery.data ?? [];
  const pagination = usePagination(reports);

  return (
    <section className="rounded-md border bg-[var(--surface)] p-5">
      <h3 className="text-sm font-semibold">{isAdmin ? "Báo cáo thôn chờ duyệt" : "Báo cáo đã gửi"}</h3>
      {reports.length === 0 ? (
        <p className="mt-3 text-sm text-[var(--text-muted)]">Chưa có báo cáo nào.</p>
      ) : (
        <ul className="mt-4 divide-y">
          {pagination.pageItems.map((r) => (
            <ReportRow key={r.id} report={r} isAdmin={isAdmin} busy={act.isPending} onAct={act.mutate} />
          ))}
        </ul>
      )}
      <Pagination
        onPageChange={pagination.setPage}
        page={pagination.page}
        pageSize={pagination.pageSize}
        totalItems={reports.length}
        totalPages={pagination.totalPages}
      />
    </section>
  );
}

function ReportRow({
  report,
  isAdmin,
  busy,
  onAct,
}: {
  report: StockReport;
  isAdmin: boolean;
  busy: boolean;
  onAct: (fn: () => Promise<unknown>) => void;
}) {
  const tone =
    report.status === "APPROVED"
      ? "var(--color-ready)"
      : report.status === "REJECTED"
        ? "var(--color-critical)"
        : "var(--color-attention)";
  const label = report.status === "APPROVED" ? "Đã duyệt" : report.status === "REJECTED" ? "Từ chối" : "Chờ duyệt";

  return (
    <li className="flex items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">
          {report.warehouse?.name ?? report.warehouseId} · kỳ {report.period}
        </p>
        <p className="text-xs text-[var(--text-muted)]">
          {report.submittedBy?.fullName ?? "—"} · {new Date(report.createdAt).toLocaleDateString("vi-VN")}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span
          className="rounded-md px-2.5 py-1 text-xs font-semibold"
          style={{ background: `color-mix(in oklch, ${tone} 14%, transparent)`, color: tone }}
        >
          {label}
        </span>
        {isAdmin && report.status === "PENDING" && (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => onAct(() => approveReport(report.id))}
              className="inline-flex items-center gap-1 rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-xs font-semibold text-[var(--color-accent-fg)] transition hover:brightness-95 active:translate-y-px disabled:opacity-60"
            >
              <ColorIcon name="success" size={16} tone="green" /> Duyệt
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => onAct(() => rejectReport(report.id))}
              className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs font-semibold transition hover:bg-[var(--surface-2)] active:translate-y-px disabled:opacity-60"
            >
              <ColorIcon name="blocked" size={16} tone="red" /> Từ chối
            </button>
          </>
        )}
      </div>
    </li>
  );
}
