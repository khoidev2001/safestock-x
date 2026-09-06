"use client";

import Link from "next/link";
import { useTabTransitionContext } from "@/lib/tab-transition-context";

/**
 * Đường dẫn trong NỘI DUNG, chuyển trang kèm đúng khối chờ của thanh menu.
 *
 * Bấm "Mở kho vật tư →" trước đây im lặng vài giây rồi trang mới hiện ra, trong
 * khi bấm tab "Vật tư" ở menu lại có dấu hiệu phóng to thu nhỏ báo là đang chạy.
 * Hai lối vào cùng một trang mà phản hồi khác hẳn nhau, nên lối im lặng bị đọc
 * thành "bấm hụt" — và người dùng bấm lại vài lần.
 *
 * VẪN là thẻ `<a>` thật, không phải nút giả dạng: giữ được menu chuột phải, mở
 * tab mới bằng chuột giữa, và xem trước đường dẫn ở góc màn hình. Chỉ cú bấm
 * trái trơn mới bị chặn để đi qua khối chờ; bấm kèm Ctrl/Cmd/Shift/Alt vẫn để
 * trình duyệt tự xử, nếu không thì "mở ở tab mới" lặng lẽ hỏng.
 */
export function TabLink({
  children,
  className,
  href,
  onClick,
  title,
}: {
  children: React.ReactNode;
  className?: string;
  href: string;
  /** Việc cần làm TRƯỚC khi rời trang, ví dụ đóng một hộp thoại đang mở. */
  onClick?: () => void;
  title?: string;
}) {
  const transition = useTabTransitionContext();

  return (
    <Link
      className={className}
      href={href}
      onClick={(event) => {
        onClick?.();
        // Ngoài dashboard không có khối chờ nào để dùng — để Next tự chuyển trang.
        if (!transition) return;
        if (event.defaultPrevented) return;
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        // Chuột giữa và chuột phải không đi qua đây trên mọi trình duyệt, nhưng
        // chặn sẵn vẫn rẻ hơn là đi tìm vì sao mở tab mới lại nhảy trang hiện tại.
        if (event.button !== 0) return;
        event.preventDefault();
        transition.goToTab(href);
      }}
      title={title}
    >
      {children}
    </Link>
  );
}
