"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { approveReport, getReport, rejectReport, type ReportRow } from "@/lib/report-api";

export function ReportReviewDialog({
  id,
  isAdmin,
  onClose,
}: {
  id: string;
  isAdmin: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [rejectNote, setRejectNote] = useState("");
  const [error, setError] = useState("");
  const report = useQuery({
    queryKey: ["report", id],
    queryFn: () => getReport(id),
  });
  const action = useMutation({
    mutationFn: (kind: "APPROVE" | "REJECT") =>
      kind === "APPROVE" ? approveReport(id) : rejectReport(id, rejectNote.trim()),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["reports"] }),
        queryClient.invalidateQueries({ queryKey: ["inventory-batches"] }),
        queryClient.invalidateQueries({ queryKey: ["warehouse-readiness"] }),
      ]);
      onClose();
    },
    onError: (mutationError) =>
      setError(
        mutationError instanceof Error ? mutationError.message : "Không xử lý được báo cáo.",
      ),
  });

  const submit = (kind: "APPROVE" | "REJECT") => {
    if (kind === "REJECT" && rejectNote.trim().length < 3) {
      setError("Nhập lý do từ chối ít nhất 3 ký tự.");
      return;
    }
    setError("");
    action.mutate(kind);
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-review-title"
    >
      <section className="my-8 w-full max-w-5xl rounded-lg border bg-[var(--surface)] p-5 shadow-2xl">
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-[var(--color-accent)]">BÁO CÁO KIỂM KÊ</p>
            <h2 className="mt-1 text-xl font-semibold" id="report-review-title">
              Xem trước số liệu trước khi xử lý
            </h2>
          </div>
          <button
            aria-label="Đóng"
            className="rounded border px-3 py-1.5"
            disabled={action.isPending}
            onClick={onClose}
          >
            ×
          </button>
        </header>

        {report.isLoading ? (
          <div className="mt-5 h-48 animate-pulse rounded-md bg-[var(--surface-2)]" />
        ) : report.isError || !report.data ? (
          <div className="mt-5 rounded-md border border-red-300 p-4" role="alert">
            <p className="text-sm text-[var(--color-critical)]">
              {report.error instanceof Error
                ? report.error.message
                : "Không tải được nội dung báo cáo."}
            </p>
            <button
              className="mt-3 rounded-md border px-3 py-1.5 text-sm"
              onClick={() => void report.refetch()}
            >
              Tải lại
            </button>
          </div>
        ) : (
          <>
            <div className="mt-5 grid gap-2 rounded-md bg-[var(--surface-2)] p-4 text-sm sm:grid-cols-3">
              <p>
                <b>Kho:</b> {report.data.warehouse?.name ?? report.data.warehouseId}
              </p>
              <p>
                <b>Kỳ:</b> {report.data.period}
              </p>
              <p>
                <b>Người gửi:</b> {report.data.submittedBy?.fullName ?? "—"}
              </p>
            </div>
            <ReportRows rows={report.data.rows ?? []} />

            {isAdmin && report.data.status === "PENDING" ? (
              <div className="mt-5 border-t pt-5">
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium">Lý do nếu từ chối</span>
                  <textarea
                    className="min-h-20 w-full rounded-md border bg-transparent px-3 py-2"
                    onChange={(event) => setRejectNote(event.target.value)}
                    placeholder="Ví dụ: Số lượng SKU NUOC-01 chưa khớp biên bản kiểm kê"
                    value={rejectNote}
                  />
                </label>
                {error ? (
                  <p className="mt-3 text-sm text-[var(--color-critical)]" role="alert">
                    {error}
                  </p>
                ) : null}
                <div className="mt-4 flex flex-wrap justify-end gap-2">
                  <button
                    className="rounded-md border px-4 py-2 font-semibold disabled:opacity-50"
                    disabled={action.isPending}
                    onClick={() => submit("REJECT")}
                  >
                    Từ chối có lý do
                  </button>
                  <button
                    className="rounded-md bg-[var(--color-accent)] px-4 py-2 font-semibold text-[var(--color-accent-fg)] disabled:opacity-50"
                    disabled={action.isPending}
                    onClick={() => submit("APPROVE")}
                  >
                    {action.isPending ? "Đang xử lý…" : "Duyệt và áp số kiểm kê"}
                  </button>
                </div>
              </div>
            ) : report.data.note ? (
              <p className="mt-4 rounded-md border p-3 text-sm">
                <b>Ghi chú xử lý:</b> {report.data.note}
              </p>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}

function ReportRows({ rows }: { rows: ReportRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="mt-4 rounded-md border p-4 text-sm text-[var(--text-muted)]">
        Báo cáo không có dòng dữ liệu hợp lệ.
      </p>
    );
  }
  return (
    <div className="mt-4 max-h-[52vh] overflow-auto rounded-md border">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead className="sticky top-0 bg-[var(--surface-2)] text-xs uppercase">
          <tr>
            <th className="px-3 py-2">SKU / vật tư</th>
            <th className="px-3 py-2">Lô / kệ</th>
            <th className="px-3 py-2 text-right">Số lượng</th>
            <th className="px-3 py-2">Đơn vị</th>
            <th className="px-3 py-2">Hạn dùng</th>
            <th className="px-3 py-2">Tình trạng</th>
            <th className="px-3 py-2">Ghi chú</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((row, index) => (
            <tr key={row.batchId ?? `${row.sku}-${index}`}>
              <td className="px-3 py-2">
                <b className="block">{row.itemName}</b>
              </td>
              <td className="px-3 py-2">
                <b className="block">{row.batchCode || "Chưa định danh lô"}</b>
                <span className="text-xs text-[var(--text-muted)]">Kệ {row.shelfCode || "—"}</span>
              </td>
              <td className="px-3 py-2 text-right font-semibold">{row.quantity}</td>
              <td className="px-3 py-2">{row.unit || "—"}</td>
              <td className="px-3 py-2">{row.expiryDate || "—"}</td>
              <td className="px-3 py-2">{row.condition || "—"}</td>
              <td className="px-3 py-2">{row.note || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
