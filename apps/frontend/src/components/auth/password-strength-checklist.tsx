"use client";

import { PASSWORD_RULES } from "@safestock/shared-types";

/**
 * Bốn điều kiện mật khẩu mạnh, đánh dấu ngay khi đang gõ.
 *
 * Lấy thẳng `PASSWORD_RULES` từ gói dùng chung — đúng bộ điều kiện máy chủ dùng để
 * chặn. Tự viết lại ở đây thì sớm muộn sẽ lệch: ô báo xanh hết mà máy chủ vẫn từ chối.
 */
export function PasswordStrengthChecklist({ password }: { password: string }) {
  return (
    <ul aria-label="Điều kiện mật khẩu" className="mt-2 grid gap-1 text-xs sm:grid-cols-2">
      {PASSWORD_RULES.map((rule) => {
        const passed = rule.test(password);
        return (
          <li
            className={passed ? "text-[var(--color-ready)]" : "text-[var(--text-muted)]"}
            key={rule.key}
          >
            <span aria-hidden className="mr-1 inline-block w-3 font-bold">
              {passed ? "✓" : "•"}
            </span>
            {rule.label}
            <span className="sr-only">{passed ? " — đạt" : " — chưa đạt"}</span>
          </li>
        );
      })}
    </ul>
  );
}
