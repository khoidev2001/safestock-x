"use client";

import { useEffect, useRef } from "react";
import { ColorIcon } from "@/components/shared/color-icon";
import { useBodyScrollLock } from "@/lib/use-body-scroll-lock";

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  /** Hậu quả của việc sắp làm, nói thẳng cái gì sẽ mất. */
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Hỏi lại trước một việc không hoàn tác được.
 *
 * Không dùng `window.confirm`: hộp thoại của trình duyệt khoá cứng cả tab, không
 * mang được màu cảnh báo lẫn chữ tiếng Việt có dấu theo đúng giọng của phần còn
 * lại, và trên một màn hình điều phối thì nó trông như lỗi trang chứ không như
 * một câu hỏi của hệ thống.
 *
 * Nút mặc định khi mở là "Huỷ", không phải nút đỏ: người quen bấm Enter cho qua
 * hộp thoại thì cú Enter đó phải rơi vào lựa chọn an toàn.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Xoá",
  cancelLabel = "Huỷ",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useBodyScrollLock(open);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-message"
      className="fixed inset-0 z-[1300] flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-[2px]"
      // Bấm ra ngoài là huỷ — cùng nghĩa với Escape, và là lối thoát mà ai cũng thử.
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div className="w-full max-w-md rounded-lg border bg-[var(--surface)] p-6 shadow-xl">
        <div className="flex items-start gap-3">
          <ColorIcon className="mt-0.5 shrink-0" name="warning" size={24} tone="red" />
          <div className="min-w-0">
            <p className="font-semibold" id="confirm-dialog-title">
              {title}
            </p>
            <p className="mt-1 text-sm text-[var(--text-muted)]" id="confirm-dialog-message">
              {message}
            </p>
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            ref={cancelRef}
            onClick={onCancel}
            className="rounded-md border px-4 py-2 text-sm font-medium transition hover:bg-[var(--surface-2)]"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-md bg-[var(--color-critical)] px-4 py-2 text-sm font-semibold text-white transition hover:brightness-95 active:translate-y-px"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
