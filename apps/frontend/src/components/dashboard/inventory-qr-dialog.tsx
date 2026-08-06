"use client";

import Image from "next/image";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import type { InventoryBatch } from "@/lib/dashboard-api";

export function InventoryQrDialog({
  batch,
  onClose,
}: {
  batch: InventoryBatch | null;
  onClose: () => void;
}) {
  const [dataUrl, setDataUrl] = useState("");
  const [error, setError] = useState("");
  const payload = batch
    ? `safestock://inventory?sku=${encodeURIComponent(batch.item.sku)}&batch=${encodeURIComponent(batch.batchCode)}`
    : "";

  useEffect(() => {
    if (!payload) return;
    setError("");
    QRCode.toDataURL(payload, {
      width: 360,
      margin: 2,
      errorCorrectionLevel: "M",
      color: { dark: "#111827", light: "#ffffff" },
    })
      .then(setDataUrl)
      .catch(() => setError("Không tạo được mã QR."));
  }, [payload]);

  if (!batch) return null;

  const print = () => {
    if (!dataUrl) return;
    const popup = window.open("", "_blank", "width=620,height=720");
    if (!popup) {
      setError("Trình duyệt đang chặn cửa sổ in. Hãy cho phép popup rồi thử lại.");
      return;
    }
    popup.document
      .write(`<!doctype html><html><head><title>Nhãn ${escapeHtml(batch.batchCode)}</title>
      <style>body{font-family:Arial,sans-serif;margin:0;padding:36px;color:#111827}.label{width:420px;border:2px solid #111827;padding:24px;text-align:center}.qr{width:320px;height:320px}.sku{font-size:24px;font-weight:800;margin:12px 0 4px}.meta{font-size:15px;margin:4px 0}</style>
      </head><body><div class="label"><img class="qr" src="${dataUrl}" alt="">
      <div class="sku">${escapeHtml(batch.item.name)}</div>
      <div class="meta">Mã ${escapeHtml(batch.item.sku)}</div>
      <div class="meta">Lô: ${escapeHtml(batch.batchCode)}</div>
      <div class="meta">${escapeHtml(batch.shelf ? `${batch.shelf.zone.code}/${batch.shelf.code}` : "Chưa xếp kệ")}</div>
      </div><script>window.onload=()=>{window.print();window.close()}</script></body></html>`);
    popup.document.close();
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
    >
      <section className="w-full max-w-md rounded-lg border bg-[var(--surface)] p-5 shadow-2xl">
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-[var(--color-accent)]">NHÃN VẬT TƯ</p>
            <h2 className="mt-1 text-xl font-semibold">{batch.item.name}</h2>
          </div>
          <button aria-label="Đóng"
            // Vùng bấm 44px: nút cũ chỉ cao 30px, trên màn hình cảm ứng và
            // laptop nhỏ phải nhắm mới trúng.
            className="flex h-11 w-11 items-center justify-center rounded-md border text-xl leading-none transition hover:bg-[var(--surface-2)]" onClick={onClose}>
            ×
          </button>
        </header>
        <div className="mt-5 grid place-items-center rounded-md bg-white p-4">
          {dataUrl ? (
            <Image alt={`QR ${batch.item.name}`} height={320} src={dataUrl} width={320} />
          ) : (
            "Đang tạo QR…"
          )}
        </div>
        <div className="mt-4 text-center">
          <p className="text-lg font-bold">{batch.item.name}</p>
          {/* Mã vẫn phải còn: đây là nhãn dán lên thùng hàng, máy quét đọc mã chứ
              không đọc tên. Chỉ hạ nó xuống dòng phụ để người đọc thấy tên trước. */}
          <p className="text-sm text-[var(--text-muted)]">
            Mã {batch.item.sku} · Lô {batch.batchCode}
          </p>
          <p className="text-sm text-[var(--text-muted)]">
            {batch.shelf ? `${batch.shelf.zone.code} / ${batch.shelf.code}` : "Chưa xếp kệ"}
          </p>
        </div>
        {error ? (
          <p className="mt-3 text-sm text-[var(--color-critical)]" role="alert">
            {error}
          </p>
        ) : null}
        <button
          className="mt-5 w-full rounded-md bg-[var(--color-accent)] px-4 py-2.5 font-semibold text-[var(--color-accent-fg)] disabled:opacity-50"
          disabled={!dataUrl}
          onClick={print}
        >
          In nhãn QR
        </button>
      </section>
    </div>
  );
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[character]!,
  );
}
