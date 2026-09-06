"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

/**
 * Giữ khối chờ trên màn hình ít nhất chừng này trước khi tắt.
 *
 * Trang đã nằm sẵn trong bộ nhớ đệm của router thì hiện gần như tức thì, và một
 * khối chờ loé lên rồi tắt trong 40ms chỉ tạo ra một cú nháy — mắt kịp thấy có
 * gì đó nhấp nháy nhưng không kịp đọc, nên nó gây khó chịu chứ không trấn an
 * được ai. Thà giữ đủ một nhịp thở của dấu hiệu còn hơn.
 */
const MIN_VISIBLE_MS = 420;

/**
 * Chốt chặn cuối: dù có chuyện gì thì cũng không khoá giao diện quá chừng này.
 *
 * Mọi đường thoát bình thường đều dựa vào việc `pathname` đổi. Nếu một hôm nào
 * đó có thứ nuốt mất lượt chuyển trang — một lượt đẩy hướng khác, một lỗi lúc
 * dựng trang — mà không có chốt này thì người dùng ngồi trước một màn hình
 * không bấm được gì và chỉ còn cách tải lại trang.
 */
const MAX_WAIT_MS = 8000;

export interface TabTransition {
  /** Đang chờ trang đích dựng xong: khoá chuột và hiện khối chờ. */
  isNavigating: boolean;
  /** Tab đang được chuyển tới — dùng để tô sáng đúng tab người dùng vừa bấm. */
  destination: string | null;
  goToTab: (path: string) => void;
}

/**
 * Chuyển tab có trạng thái chờ nhìn thấy được.
 *
 * App Router chuyển trang ngầm: bấm xong không có gì đổi cho tới khi trang mới
 * dựng xong. Trên máy chậm hoặc mạng chậm, khoảng lặng đó dài vài giây và người
 * dùng bấm tiếp — mỗi lần bấm xếp thêm một lượt chuyển vào hàng đợi, và cái họ
 * nhận về cuối cùng không phải tab họ bấm sau cùng.
 *
 * Mốc kết thúc là `pathname` ĐÃ RỜI CHỖ CŨ chứ không phải "đã tới đúng đích":
 * trang đích có thể đẩy tiếp sang chỗ khác vì thiếu quyền, và bám vào đúng đích
 * thì khối chờ sẽ đứng lại tới tận chốt chặn dù trang mới đã hiện xong từ lâu.
 */
export function useTabTransition(): TabTransition {
  const router = useRouter();
  const pathname = usePathname();
  const [destination, setDestination] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const startedAt = useRef(0);
  const leftFrom = useRef<string | null>(null);

  const goToTab = useCallback(
    (path: string) => {
      // Đang đứng sẵn ở đó thì không có gì để chờ; hiện khối chờ lúc này chỉ làm
      // trang nháy một cái rồi trả lại đúng nội dung cũ.
      if (path === pathname) return;
      startedAt.current = Date.now();
      leftFrom.current = pathname;
      setDestination(path);
      startTransition(() => router.push(path));
    },
    [pathname, router],
  );

  useEffect(() => {
    if (!destination || pathname === leftFrom.current) return;
    const remaining = Math.max(0, MIN_VISIBLE_MS - (Date.now() - startedAt.current));
    const timer = setTimeout(() => setDestination(null), remaining);
    return () => clearTimeout(timer);
  }, [pathname, destination]);

  useEffect(() => {
    if (!destination) return;
    const timer = setTimeout(() => setDestination(null), MAX_WAIT_MS);
    return () => clearTimeout(timer);
  }, [destination]);

  return { isNavigating: destination !== null, destination, goToTab };
}
