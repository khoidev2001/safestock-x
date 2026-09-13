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
  /**
   * Điều khiển từ ngoài — dùng khi một nút NẰM TRONG tiêu đề cũng cần mở khối ra
   * (ví dụ bấm thẻ kho để xem vật tư của kho đó). Bỏ trống thì khối tự giữ trạng thái.
   */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
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
  open: controlledOpen,
  onOpenChange,
  className,
  style,
  headingId,
  children,
}: CollapsiblePanelProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const open = controlledOpen ?? uncontrolledOpen;
  /**
   * Có đang cắt phần thừa hay không.
   *
   * Hoạt ảnh gập chạy được là nhờ `overflow: hidden` — không cắt thì nội dung
   * vẫn hiện nguyên si trong lúc ô chứa co lại. Nhưng cắt MÃI thì các bong bóng
   * chú thích hay menu thò ra ở dòng đầu và dòng cuối bị xén mất một nửa. Nên chỉ cắt trong lúc chạy hoạt ảnh; mở xong thì
   * thả ra. Lúc đang gập thì cắt luôn, vì lúc đó chẳng có gì được phép thò ra.
   */
  const [clipping, setClipping] = useState(!open);

  /*
    Thả cắt bằng ĐỒNG HỒ chứ không bằng `transitionend`.

    Người đã tắt hiệu ứng trong hệ điều hành không có `transitionend` nào để chờ
    — hoạt ảnh bị tắt hẳn — nên khối của họ sẽ cắt vĩnh viễn và mất một nửa mấy
    bong bóng chú thích. Sự kiện của con cũng nổi bọt lên đúng chỗ này (mọi nút
    bên trong đều có `transition`), nên nghe nó còn phải lọc thêm.
  */
  useEffect(() => {
    // Bị đóng từ ngoài thì cắt ngay, như lúc tự bấm đóng.
    if (!open) {
      setClipping(true);
      return;
    }
    const timer = setTimeout(() => setClipping(false), COLLAPSE_MS + 40);
    return () => clearTimeout(timer);
  }, [open]);

  return (
    <section className={className ?? "app-panel p-5"} style={style}>
      <button
        type="button"
        onClick={() => {
          setClipping(true);
          setUncontrolledOpen(!open);
          onOpenChange?.(!open);
        }}
        aria-expanded={open}
        /* Màn rộng: tiêu đề · huy hiệu · mũi tên chung một hàng, phụ đề dưới tiêu
           đề. Điện thoại: tiêu đề và mũi tên ở hàng đầu, huy hiệu xuống hàng hai,
           phụ đề trải hết bề ngang thẻ ở hàng ba.

           Giữ nguyên bố cục màn rộng trên điện thoại thì huy hiệu "Mức 5/5 · Rất
           cao" ăn mất gần nửa bề ngang: tiêu đề hai chữ bẻ thành ba dòng, và các
           thẻ kho trong phụ đề bị ép thành cột chữ dựng đứng. */
        className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 text-left sm:grid-cols-[minmax(0,1fr)_auto_auto]"
      >
        <span
          className="col-start-1 row-start-1 flex min-w-0 items-center gap-2 font-semibold"
          style={tone ? { color: tone } : undefined}
        >
          {icon}
          <span id={headingId}>{title}</span>
        </span>
        {badge ? (
          <span className="col-span-2 row-start-2 mt-2 justify-self-start sm:col-span-1 sm:col-start-2 sm:row-start-1 sm:mt-0">
            {badge}
          </span>
        ) : null}
        <span
          className={`col-start-2 row-start-1 shrink-0 transition-transform duration-300 ease-out motion-reduce:transition-none sm:col-start-3 ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        >
          <ColorIcon name="down" size={18} tone="blue" />
        </span>
        {subtitle ? (
          <span className="col-span-2 row-start-3 mt-1 block text-sm text-[var(--text-muted)] sm:col-span-1 sm:col-start-1 sm:row-start-2">
            {subtitle}
          </span>
        ) : null}
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
        className={`grid grid-cols-1 transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none ${
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
