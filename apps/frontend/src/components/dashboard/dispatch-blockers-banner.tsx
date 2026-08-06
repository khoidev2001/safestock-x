"use client";

import { ColorIcon } from "@/components/shared/color-icon";

export interface BlockerLike {
  code: string;
  title: string;
  reasons: string[];
}

/**
 * Dải việc đang chặn điều phối, đặt ở ĐẦU trang tổng quan.
 *
 * Trước đây điểm chặn chỉ hiện thành một con số trong bốn thẻ thống kê ("Việc cần
 * làm: 2"), còn danh sách thật nằm dưới, bên trong khối điểm sẵn sàng. Người mở
 * trang thấy con số nhưng không biết là việc gì, phải cuộn xuống rồi mở khối ra
 * mới đọc được — mà đây đúng là thứ duy nhất trên trang cần hành động ngay.
 *
 * Không có điểm chặn thì KHÔNG hiện gì cả. Một dải xanh báo "mọi thứ đều ổn" chỉ
 * chiếm chỗ và tập cho người dùng thói quen bỏ qua dải này, đúng lúc nó chuyển
 * sang đỏ thì họ cũng lướt qua luôn.
 */
export function DispatchBlockersBanner({ blockers }: { blockers?: BlockerLike[] }) {
  if (!blockers || blockers.length === 0) return null;

  return (
    <section
      aria-labelledby="diem-chan-dieu-phoi"
      className="rounded-md border p-4"
      style={{ borderColor: "var(--color-critical)", background: "var(--surface)" }}
    >
      <div className="flex items-center gap-2">
        <ColorIcon name="blocked" size={18} tone="red" />
        <h2
          className="font-semibold"
          id="diem-chan-dieu-phoi"
          style={{ color: "var(--color-critical)" }}
        >
          {blockers.length} việc đang chặn điều phối
        </h2>
      </div>
      <ul className="mt-3 space-y-2">
        {blockers.map((blocker) => (
          <li className="flex gap-2 text-sm" key={blocker.code}>
            <span aria-hidden="true" className="text-[var(--text-muted)]">
              •
            </span>
            <span>
              <span className="font-medium">{blocker.title}</span>
              {/* Ghép bằng dấu chấm giữa: các lý do là những câu rời, nối liền
                  nhau không dấu thì đọc thành một câu vô nghĩa. */}
              <span className="text-[var(--text-muted)]">
                {" — "}
                {blocker.reasons.join(" · ") || "Cần xác minh tại kho."}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
