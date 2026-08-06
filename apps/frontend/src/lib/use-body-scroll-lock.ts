"use client";

import { useEffect } from "react";

/**
 * Khoá cuộn trang nền khi một hộp thoại đang mở.
 *
 * Không khoá thì con lăn chuột đi xuyên qua lớp phủ và cuộn trang phía sau: hộp
 * thoại đứng yên còn nền trôi mất, nhìn như giao diện vỡ. Trên màn hình "Đang
 * phân tích bằng AI" — hộp thoại đứng lâu nhất trong cả app, vài chục giây — ai
 * cũng lỡ tay cuộn ít nhất một lần.
 *
 * Bù lại đúng bề rộng thanh cuộn vừa mất, nếu không toàn bộ trang nhảy ngang một
 * nhịp lúc mở và lúc đóng.
 */
export function useBodyScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active || typeof document === "undefined") return;

    const body = document.body;
    const overflowCu = body.style.overflow;
    const paddingCu = body.style.paddingRight;
    const beRongThanhCuon = window.innerWidth - document.documentElement.clientWidth;

    body.style.overflow = "hidden";
    if (beRongThanhCuon > 0) body.style.paddingRight = `${beRongThanhCuon}px`;

    return () => {
      body.style.overflow = overflowCu;
      body.style.paddingRight = paddingCu;
    };
  }, [active]);
}
