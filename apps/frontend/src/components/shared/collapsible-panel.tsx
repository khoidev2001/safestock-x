"use client";

import { useEffect, useState } from "react";
import { ColorIcon } from "./color-icon";

/** Thời lượng gập/mở, dùng chung cho lớp CSS và cho đồng hồ thả cắt bên dưới. */
const COLLAPSE_MS = 300;

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
  /**
   * Có đang cắt phần thừa hay không.
   *
   * Hoạt ảnh gập chạy được là nhờ `overflow: hidden` — không cắt thì nội dung
   * vẫn hiện nguyên si trong lúc ô chứa co lại. Nhưng cắt MÃI thì các bong bóng
   * chú thích ở dòng đầu và dòng cuối (xem `WhyNeeded` trong khối khả năng đáp
   * ứng) bị xén mất một nửa. Nên chỉ cắt trong lúc chạy hoạt ảnh; mở xong thì
   * thả ra. Lúc đang gập thì cắt luôn, vì lúc đó chẳng có gì được phép thò ra.
   */
  const [clipping, setClipping] = useState(!defaultOpen);

  /*
    Thả cắt bằng ĐỒNG HỒ chứ không bằng `transitionend`.

    Người đã tắt hiệu ứng trong hệ điều hành không có `transitionend` nào để chờ
    — hoạt ảnh bị tắt hẳn — nên khối của họ sẽ cắt vĩnh viễn và mất một nửa mấy
    bong bóng chú thích. Sự kiện của con cũng nổi bọt lên đúng chỗ này (mọi nút
    bên trong đều có `transition`), nên nghe nó còn phải lọc thêm.
  */
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => setClipping(false), COLLAPSE_MS + 40);
    return () => clearTimeout(timer);
  }, [open]);

  return (
    <section className={className ?? "app-panel p-5"} style={style}>
      <button
        type="button"
        onClick={() => {
          setClipping(true);
          setOpen((current) => !current);
        }}
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
          className={`shrink-0 transition-transform duration-300 ease-out motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        >
          <ColorIcon name="down" size={18} tone="blue" />
        </span>
      </button>
      {/*
        Gập bằng lưới `0fr → 1fr` chứ không bằng `max-height` phỏng chừng.
        Chiều cao mỗi khối ở đây chênh nhau cả chục lần (một dòng "chưa có dữ
        liệu" so với bảng ba mươi dòng), nên `max-height` đặt bừa một số lớn thì
        khối ngắn gập xong sau khi hoạt ảnh đã chạy hết phần trống — nhìn ra là
        giật cục và trễ. Lưới nội suy đúng chiều cao thật của nội dung.

        Nội dung nằm lại trong cây DOM lúc gập nên `inert` phải có: không thì
        bàn phím vẫn Tab vào được những nút đang bị giấu, và trình đọc màn hình
        vẫn đọc chúng.
      */}
      <div
        className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none ${
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
        inert={!open}
      >
        <div className={clipping ? "overflow-hidden" : ""}>
          <div className="mt-4">{children}</div>
        </div>
      </div>
    </section>
  );
}
