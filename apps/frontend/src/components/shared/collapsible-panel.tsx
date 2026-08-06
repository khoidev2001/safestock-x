"use client";

import { useState } from "react";
import { ColorIcon } from "./color-icon";

export interface CollapsiblePanelProps {
  title: string;
  /** Biểu tượng đứng trước tiêu đề; bỏ trống thì tiêu đề tự căn sát lề. */
  icon?: React.ReactNode;
  /** Câu mô tả ngắn dưới tiêu đề, vẫn đọc được khi khối đang thu gọn. */
  subtitle?: React.ReactNode;
  /** Nhãn tóm tắt bên phải (số lượng, trạng thái) — thứ cần liếc là thấy. */
  badge?: React.ReactNode;
  /** Màu riêng cho tiêu đề, dùng cho khối cảnh báo. */
  tone?: string;
  defaultOpen?: boolean;
  className?: string;
  /** Nền riêng, dùng cho khối đổi màu theo mức khẩn cấp. */
  style?: React.CSSProperties;
  headingId?: string;
  children: React.ReactNode;
}

/**
 * Khối nội dung gập/mở được.
 *
 * Trang chi tiết một nhiệm vụ có gần chục khối, mỗi khối một bảng dài; cuộn từ
 * đầu tới cuối mất cả màn hình mà phần lớn thời gian người dùng chỉ cần một hai
 * khối. Gập được thì họ tự chọn thứ mình đang cần nhìn.
 *
 * Tiêu đề là <button> chứ không phải <div> có onClick: bàn phím tab tới được,
 * trình đọc màn hình biết nó đóng hay mở, và Enter/Space hoạt động sẵn.
 */
export function CollapsiblePanel({
  title,
  icon,
  subtitle,
  badge,
  tone,
  defaultOpen = true,
  className,
  style,
  headingId,
  children,
}: CollapsiblePanelProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={className ?? "app-panel p-5"} style={style}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        className="flex w-full items-start gap-3 text-left"
      >
        <span className="min-w-0 flex-1">
          <span
            className="flex items-center gap-2 font-semibold"
            style={tone ? { color: tone } : undefined}
          >
            {icon}
            <span id={headingId}>{title}</span>
          </span>
          {subtitle ? (
            <span className="mt-1 block text-sm text-[var(--text-muted)]">{subtitle}</span>
          ) : null}
        </span>
        {badge ? <span className="shrink-0">{badge}</span> : null}
        <span
          className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        >
          <ColorIcon name="down" size={18} tone="blue" />
        </span>
      </button>
      {open ? <div className="mt-4">{children}</div> : null}
    </section>
  );
}
