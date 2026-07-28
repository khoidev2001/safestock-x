"use client";

import { useState } from "react";
import {
  adjustInventoryBatch,
  borrowInventoryBatch,
  createMutationRequestId,
  exportInventoryBatch,
  importInventoryBatch,
  reconcileBatch,
  transferInventoryBatch,
  updateInventoryCondition,
  type InventoryBatch,
  type ShelfSummary,
} from "@/lib/dashboard-api";
import type { InventoryRowAction } from "./inventory-table";

type Props = {
  action: InventoryRowAction | null;
  batch: InventoryBatch | null;
  shelves: (ShelfSummary & {
    zoneLabel: string;
    warehouseId?: string;
    warehouseName?: string;
  })[];
  onClose: () => void;
  onSuccess: (message: string) => Promise<void>;
};

const actionTitles: Record<InventoryRowAction, string> = {
  IMPORT: "Nhập thêm vào lô",
  EXPORT: "Xuất khỏi kho",
  TRANSFER: "Chuyển vị trí",
  ADJUST: "Điều chỉnh tồn hệ thống",
  RECONCILE: "Đối chiếu kiểm kê",
  CONDITION: "Cập nhật tình trạng",
  BORROW: "Tạo phiếu mượn",
};

export function InventoryActionDialog({ action, batch, shelves, onClose, onSuccess }: Props) {
  const [quantity, setQuantity] = useState("1");
  const [newQuantity, setNewQuantity] = useState(batch ? String(batch.quantity) : "0");
  const [note, setNote] = useState("");
  const [toShelfId, setToShelfId] = useState("");
  const [condition, setCondition] = useState("NEEDS_CHECK");
  const [applyOverride, setApplyOverride] = useState(false);
  const [requestId] = useState(createMutationRequestId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!action || !batch) return null;

  const submit = async () => {
    const amount = Number(quantity);
    const adjusted = Number(newQuantity);
    if (["IMPORT", "EXPORT", "TRANSFER", "BORROW"].includes(action) && (!Number.isInteger(amount) || amount <= 0)) {
      setError("Số lượng phải là số nguyên dương.");
      return;
    }
    if (["ADJUST", "RECONCILE"].includes(action) && (!Number.isInteger(adjusted) || adjusted < 0)) {
      setError("Số lượng phải là số nguyên không âm.");
      return;
    }
    if (action === "TRANSFER" && !toShelfId) {
      setError("Chọn kệ đích.");
      return;
    }
    if (["ADJUST", "CONDITION"].includes(action) && note.trim().length < 3) {
      setError("Lý do/ghi chú cần ít nhất 3 ký tự.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      if (action === "IMPORT") {
        await importInventoryBatch({ batchId: batch.id, quantity: amount, note: clean(note), requestId });
      } else if (action === "EXPORT") {
        await exportInventoryBatch({ batchId: batch.id, quantity: amount, note: clean(note), requestId });
      } else if (action === "TRANSFER") {
        await transferInventoryBatch({
          batchId: batch.id,
          toShelfId,
          quantity: amount,
          note: clean(note),
          requestId,
        });
      } else if (action === "ADJUST") {
        await adjustInventoryBatch({
          batchId: batch.id,
          newQuantity: adjusted,
          reason: note.trim(),
          requestId,
        });
      } else if (action === "RECONCILE") {
        await reconcileBatch({
          batchId: batch.id,
          countedQty: adjusted,
          applyOverride,
          note: clean(note),
          requestId,
        });
      } else if (action === "CONDITION") {
        await updateInventoryCondition({
          batchId: batch.id,
          condition,
          note: note.trim(),
          requestId,
        });
      } else {
        await borrowInventoryBatch({ batchId: batch.id, quantity: amount, requestId });
      }
      await onSuccess(`${actionTitles[action]} thành công.`);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Không thực hiện được thao tác.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" role="dialog" aria-modal="true">
      <section className="w-full max-w-lg rounded-lg border bg-[var(--surface)] p-5 shadow-2xl">
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-[var(--color-accent)]">{batch.item.sku} · {batch.batchCode}</p>
            <h2 className="mt-1 text-xl font-semibold">{actionTitles[action]}</h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">Tồn vật lý hiện tại: {batch.quantity}</p>
          </div>
          <button aria-label="Đóng" className="rounded border px-3 py-1.5" onClick={onClose}>×</button>
        </header>

        <div className="mt-5 space-y-4">
          {["IMPORT", "EXPORT", "TRANSFER", "BORROW"].includes(action) ? (
            <Field label="Số lượng">
              <input className="w-full rounded-md border bg-transparent px-3 py-2" min={1} onChange={(e) => setQuantity(e.target.value)} type="number" value={quantity} />
            </Field>
          ) : null}
          {["ADJUST", "RECONCILE"].includes(action) ? (
            <Field label={action === "RECONCILE" ? "Số đếm thực tế trong kho" : "Tồn hệ thống mới"}>
              <input className="w-full rounded-md border bg-transparent px-3 py-2" min={0} onChange={(e) => setNewQuantity(e.target.value)} type="number" value={newQuantity} />
            </Field>
          ) : null}
          {action === "TRANSFER" ? (
            <Field label="Kho và kệ đích">
              <select className="w-full rounded-md border bg-[var(--surface)] px-3 py-2" onChange={(e) => setToShelfId(e.target.value)} value={toShelfId}>
                <option value="">Chọn kho / kệ</option>
                {shelves.filter((shelf) => shelf.id !== batch.shelf?.id && !shelf.isLocked).map((shelf) => (
                  <option key={shelf.id} value={shelf.id}>{shelf.zoneLabel} / {shelf.code}</option>
                ))}
              </select>
            </Field>
          ) : null}
          {action === "CONDITION" ? (
            <Field label="Tình trạng mới">
              <select className="w-full rounded-md border bg-[var(--surface)] px-3 py-2" onChange={(e) => setCondition(e.target.value)} value={condition}>
                <option value="NEW">Mới</option>
                <option value="USED">Đã dùng</option>
                <option value="NEEDS_CHECK">Cần kiểm tra</option>
                <option value="DAMAGED">Hư hỏng</option>
              </select>
            </Field>
          ) : null}
          {action === "RECONCILE" ? (
            <label className="flex items-start gap-3 rounded-md border p-3 text-sm">
              <input checked={applyOverride} className="mt-1" onChange={(e) => setApplyOverride(e.target.checked)} type="checkbox" />
              <span><b>Áp số đếm vào tồn hệ thống</b><br /><span className="text-[var(--text-muted)]">Bỏ chọn nếu chỉ muốn lưu biên bản kiểm kê.</span></span>
            </label>
          ) : null}
          {!["BORROW"].includes(action) ? (
            <Field label={["ADJUST", "CONDITION"].includes(action) ? "Lý do bắt buộc" : "Ghi chú"}>
              <textarea className="min-h-20 w-full rounded-md border bg-transparent px-3 py-2" onChange={(e) => setNote(e.target.value)} value={note} />
            </Field>
          ) : null}
        </div>
        {error ? <p className="mt-4 text-sm text-[var(--color-critical)]" role="alert">{error}</p> : null}
        <div className="mt-5 flex justify-end gap-2">
          <button className="rounded-md border px-4 py-2" disabled={busy} onClick={onClose}>Hủy</button>
          <button className="rounded-md bg-[var(--color-accent)] px-4 py-2 font-semibold text-[var(--color-accent-fg)] disabled:opacity-50" disabled={busy} onClick={() => void submit()}>
            {busy ? "Đang xử lý…" : "Xác nhận"}
          </button>
        </div>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-sm font-medium">{label}</span>{children}</label>;
}

function clean(value: string): string | undefined {
  return value.trim() || undefined;
}
