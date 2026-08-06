"use client";

import { useState } from "react";
import {
  createMutationRequestId,
  receiveInventoryBatch,
  type InventoryBatch,
  type InventoryCatalogItem,
  type ShelfSummary,
} from "@/lib/dashboard-api";

type ShelfOption = ShelfSummary & { zoneLabel: string };

export function InventoryReceivingDialog({
  open,
  catalog,
  shelves,
  onClose,
  onSuccess,
}: {
  open: boolean;
  catalog: InventoryCatalogItem[];
  shelves: ShelfOption[];
  onClose: () => void;
  onSuccess: (result: { batch: InventoryBatch; qrPayload: string }) => Promise<void>;
}) {
  const [mode, setMode] = useState<"EXISTING" | "NEW">("EXISTING");
  const [itemId, setItemId] = useState("");
  const [shelfId, setShelfId] = useState("");
  const [batchCode, setBatchCode] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [expiryDate, setExpiryDate] = useState("");
  const [note, setNote] = useState("");
  const [sku, setSku] = useState("");
  const [name, setName] = useState("");
  const [categoryName, setCategoryName] = useState("");
  const [unit, setUnit] = useState("");
  const [consumable, setConsumable] = useState(false);
  const [requestId] = useState(createMutationRequestId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!open) return null;

  const submit = async () => {
    const amount = Number(quantity);
    if (!shelfId || !batchCode.trim() || !Number.isInteger(amount) || amount <= 0) {
      setError("Chọn kệ, nhập mã lô và số lượng nguyên dương.");
      return;
    }
    if (mode === "EXISTING" && !itemId) {
      setError("Chọn vật tư trong danh mục.");
      return;
    }
    if (
      mode === "NEW" &&
      [sku, name, categoryName, unit].some((value) => value.trim().length < 1)
    ) {
      setError("Vật tư mới cần SKU, tên, danh mục và đơn vị tính.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      const result = await receiveInventoryBatch({
        itemId: mode === "EXISTING" ? itemId : undefined,
        newItem:
          mode === "NEW"
            ? {
                sku: sku.trim(),
                name: name.trim(),
                consumable,
                categoryName: categoryName.trim(),
                unit: unit.trim(),
              }
            : undefined,
        shelfId,
        batchCode: batchCode.trim(),
        quantity: amount,
        expiryDate: expiryDate ? new Date(`${expiryDate}T12:00:00`).toISOString() : undefined,
        note: note.trim() || undefined,
        requestId,
      });
      await onSuccess(result);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Không tiếp nhận được lô.");
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
      <section className="my-8 w-full max-w-xl rounded-lg border bg-[var(--surface)] p-5 shadow-2xl">
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-[var(--color-accent)]">NHẬP KHO</p>
            <h2 className="mt-1 text-xl font-semibold">Tiếp nhận lô mới</h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Tạo lô, ledger nhập và nhãn QR trong một giao dịch.
            </p>
          </div>
          <button aria-label="Đóng"
            // Vùng bấm 44px: nút cũ chỉ cao 30px, trên màn hình cảm ứng và
            // laptop nhỏ phải nhắm mới trúng.
            className="flex h-11 w-11 items-center justify-center rounded-md border text-xl leading-none transition hover:bg-[var(--surface-2)]" onClick={onClose}>
            ×
          </button>
        </header>

        <div className="mt-5 flex rounded-md border p-1">
          {(["EXISTING", "NEW"] as const).map((value) => (
            <button
              className={`flex-1 rounded px-3 py-2 text-sm font-semibold ${mode === value ? "bg-[var(--surface-2)]" : ""}`}
              key={value}
              onClick={() => setMode(value)}
            >
              {value === "EXISTING" ? "Vật tư có sẵn" : "Vật tư mới"}
            </button>
          ))}
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {mode === "EXISTING" ? (
            <Field label="Vật tư">
              <select
                className="w-full rounded-md border bg-[var(--surface)] px-3 py-2"
                onChange={(e) => setItemId(e.target.value)}
                value={itemId}
              >
                <option value="">Chọn vật tư</option>
                {catalog.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </Field>
          ) : (
            <>
              <Field label="SKU">
                <Input onChange={setSku} value={sku} />
              </Field>
              <Field label="Tên vật tư">
                <Input onChange={setName} value={name} />
              </Field>
              <Field label="Danh mục">
                <Input onChange={setCategoryName} value={categoryName} />
              </Field>
              <Field label="Đơn vị tính">
                <Input onChange={setUnit} value={unit} />
              </Field>
              <label className="flex items-center gap-2 text-sm">
                <input
                  checked={consumable}
                  onChange={(e) => setConsumable(e.target.checked)}
                  type="checkbox"
                />
                Vật tư tiêu hao
              </label>
            </>
          )}
          <Field label="Kệ nhận hàng">
            <select
              className="w-full rounded-md border bg-[var(--surface)] px-3 py-2"
              onChange={(e) => setShelfId(e.target.value)}
              value={shelfId}
            >
              <option value="">Chọn kệ</option>
              {shelves
                .filter((shelf) => !shelf.isLocked)
                .map((shelf) => (
                  <option key={shelf.id} value={shelf.id}>
                    {shelf.zoneLabel} / {shelf.code}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Mã lô">
            <Input onChange={setBatchCode} value={batchCode} />
          </Field>
          <Field label="Số lượng">
            <Input min={1} onChange={setQuantity} type="number" value={quantity} />
          </Field>
          <Field label="Hạn dùng (nếu có)">
            <Input onChange={setExpiryDate} type="date" value={expiryDate} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Ghi chú">
              <Input onChange={setNote} value={note} />
            </Field>
          </div>
        </div>

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
            {busy ? "Đang tiếp nhận…" : "Tạo lô và nhãn QR"}
          </button>
        </div>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}

function Input({
  value,
  onChange,
  type = "text",
  min,
}: {
  value: string;
  onChange: (value: string) => void;
  type?: string;
  min?: number;
}) {
  return (
    <input
      className="w-full rounded-md border bg-transparent px-3 py-2"
      min={min}
      onChange={(e) => onChange(e.target.value)}
      type={type}
      value={value}
    />
  );
}
