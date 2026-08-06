"use client";

import { useEffect, useState } from "react";
import { useBodyScrollLock } from "@/lib/use-body-scroll-lock";
import { ColorIcon } from "./color-icon";

export interface AiProgressDialogProps {
  open: boolean;
  /** Việc đang chạy, ví dụ "Lập bản tham mưu". */
  title: string;
  /** Các bước hệ thống thật sự chạy cho việc này. */
  steps: string[];
  /** Ước lượng thời gian, lấy từ số đo thật chứ không phải phỏng đoán. */
  estimate?: string;
}

/**
 * Hộp thoại chờ cho các thao tác AI.
 *
 * Một nút mờ đi trong bốn mươi giây trông y như ứng dụng bị treo — người dùng bấm
 * lại, hoặc bỏ đi. Hộp thoại này nói rõ đang chạy việc gì, gồm những bước nào và
 * đã mất bao lâu.
 *
 * Cố ý KHÔNG có thanh phần trăm: hệ thống không biết mô hình đang ở đâu trong câu
 * trả lời, nên mọi con số phần trăm đều là bịa. Đồng hồ giây là số thật, và nó
 * cũng đủ để người xem biết máy vẫn đang chạy.
 */
export function AiProgressDialog({ open, title, steps, estimate }: AiProgressDialogProps) {
  const [seconds, setSeconds] = useState(0);
  useBodyScrollLock(open);

  useEffect(() => {
    if (!open) {
      setSeconds(0);
      return;
    }
    const startedAt = Date.now();
    const timer = setInterval(() => {
      setSeconds(Math.round((Date.now() - startedAt) / 1000));
    }, 250);
    return () => clearInterval(timer);
  }, [open]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      aria-busy="true"
      className="fixed inset-0 z-[1200] flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-[2px]"
    >
      <div className="w-full max-w-md rounded-lg border bg-[var(--surface)] p-6 shadow-xl">
        <div className="flex items-center gap-3">
          <ColorIcon className="animate-spin" name="loading" size={24} tone="amber" />
          <div className="min-w-0">
            <p className="font-semibold">{title}</p>
            <p className="text-sm text-[var(--text-muted)]">
              Đang phân tích bằng AI · <span className="tabular">{seconds}</span> giây
              {estimate ? ` · thường mất ${estimate}` : ""}
            </p>
          </div>
        </div>

        <ul className="mt-4 space-y-2 border-t pt-4">
          {steps.map((step) => (
            <li className="flex gap-2 text-sm text-[var(--text-muted)]" key={step}>
              <ColorIcon className="mt-0.5 shrink-0" name="magic" size={15} tone="amber" />
              <span>{step}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
