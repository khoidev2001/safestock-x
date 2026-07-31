"use client";

import { useState } from "react";
import {
  bulkExportInventory,
  createMutationRequestId,
  type InventoryBatch,
} from "@/lib/dashboard-api";

export function InventoryBulkExportDialog({
  open,
  batches,
  onClose,
  onSuccess,
}: {
  open: boolean;
  batches: InventoryBatch[];
  onClose: () => void;
  onSuccess: (message: string) => Promise<void>;
}) {
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [requestId] = useState(createMutationRequestId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!open) return null;

  const submit = async () => {
    const items = batches
      .map((batch) => ({ batchId: batch.id, quantity: Number(quantities[batch.id] ?? 0) }))
      .filter((item) => Number.isInteger(item.quantity) && item.quantity > 0);
    if (items.length === 0) {
      setError("Nhập số lượng cho ít nhất một lô.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await bulkExportInventory({ items, note: note.trim() || undefined, requestId });
      await onSuccess(`Đã xuất nguyên tử ${items.length} lô.`);
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "Không xuất được danh sách lô.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
    >
      <section className="my-8 w-full max-w-2xl rounded-lg border bg-[var(--surface)] p-5 shadow-2xl">
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-[var(--color-accent)]">XUẤT NHIỀU LÔ</p>
            <h2 className="mt-1 text-xl font-semibold">Phiếu xuất nguyên tử</h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Một lô lỗi sẽ rollback toàn bộ phiếu.
            </p>
          </div>
          <button aria-label="Đóng" className="rounded border px-3 py-1.5" onClick={onClose}>
            ×
          </button>
        </header>
        <div className="mt-5 max-h-[48vh] divide-y overflow-y-auto rounded-md border">
          {batches.map((batch) => (
            <label className="flex items-center gap-3 p-3" key={batch.id}>
              <span className="min-w-0 flex-1">
                <b className="block truncate">{batch.item.name}</b>
                <span className="text-xs text-[var(--text-muted)]">
                  {batch.item.sku} · {batch.batchCode} · tồn {batch.quantity}
                </span>
              </span>
              <input
                aria-label={`Số lượng ${batch.item.name}`}
                className="w-24 rounded-md border bg-transparent px-3 py-2 text-right"
                max={batch.quantity}
                min={0}
                onChange={(event) =>
                  setQuantities((current) => ({ ...current, [batch.id]: event.target.value }))
                }
                type="number"
                value={quantities[batch.id] ?? ""}
              />
            </label>
          ))}
        </div>
        <label className="mt-4 block">
          <span className="mb-1.5 block text-sm font-medium">Ghi chú phiếu xuất</span>
          <textarea
            className="min-h-20 w-full rounded-md border bg-transparent px-3 py-2"
            onChange={(event) => setNote(event.target.value)}
            value={note}
          />
        </label>
        {error ? (
          <p className="mt-4 text-sm text-[var(--color-critical)]" role="alert">
            {error}
          </p>
        ) : null}
        <div className="mt-5 flex justify-end gap-2">
          <button className="rounded-md border px-4 py-2" disabled={busy} onClick={onClose}>
            Hủy
          </button>
          <button
            className="rounded-md bg-[var(--color-accent)] px-4 py-2 font-semibold text-[var(--color-accent-fg)] disabled:opacity-50"
            disabled={busy}
            onClick={() => void submit()}
          >
            {busy ? "Đang xuất…" : "Xác nhận xuất"}
          </button>
        </div>
      </section>
    </div>
  );
}
