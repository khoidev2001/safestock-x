"use client";

import Image from "next/image";

/**
 * Trạng thái "đang tải" dùng chung: dấu hiệu thương hiệu phóng to thu nhỏ đều đặn
 * kèm một dòng chữ nói rõ đang chờ cái gì.
 *
 * Dùng logo thay cho vòng xoay chung chung là có chủ ý: nó nói được "đúng ứng
 * dụng này đang làm việc", trong khi một vòng xoay xám thì trông hệt như trình
 * duyệt bị treo. Nhịp thở chậm (1,6 giây một vòng) cũng đọc ra là "đang chạy
 * bình thường", còn nhịp giật nhanh lại giục người ta bấm lại.
 *
 * Dòng chữ nằm dưới và KHÔNG đổi font: đây là chỗ người dùng nhìn khi đang sốt
 * ruột, một font lạ chen vào chỉ làm màn hình trông như đang hỏng.
 */
export function BrandLoader({
  label = "Đang tải…",
  size = 84,
  className = "",
}: {
  label?: string;
  /** Cạnh của dấu hiệu, tính bằng px ở trạng thái nghỉ. */
  size?: number;
  className?: string;
}) {
  return (
    <div
      aria-live="polite"
      className={`flex flex-col items-center justify-center gap-5 ${className}`}
      role="status"
    >
      <span className="brand-loader-stage" style={{ width: size, height: size }}>
        {/* Quầng sáng nở ngược pha với dấu hiệu: chuyển động đọc ra được ngay cả
            khi nhìn bằng đuôi mắt, mà không cần phóng dấu hiệu to hơn nữa. */}
        <span aria-hidden className="brand-loader-halo" />
        <Image
          alt=""
          aria-hidden
          className="brand-loader-mark"
          height={733}
          priority
          sizes={`${size}px`}
          src="/brand/ung-pho-nhanh-mark.png"
          width={753}
        />
      </span>
      <p className="brand-loader-label">{label}</p>
    </div>
  );
}
