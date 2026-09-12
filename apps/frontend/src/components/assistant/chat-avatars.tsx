"use client";

import { useAuth } from "@/lib/auth-store";

/**
 * Ảnh đại diện của trợ lý và của người đang hỏi, dùng chung cho mọi chỗ khung
 * chat xuất hiện.
 *
 * Để mỗi nơi tự vẽ một biểu tượng riêng thì bong bóng trong khung chat, biểu
 * tượng ở đầu cửa sổ và màn hình chào lại là ba khuôn mặt khác nhau cho cùng một
 * trợ lý — người dùng không ghép được chúng làm một.
 */

export const ASSISTANT_AVATAR_SRC = "/assistant-avatar.png";

export function AssistantAvatar({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    <img
      alt=""
      aria-hidden="true"
      className={`shrink-0 rounded-full object-cover ${className}`}
      height={size}
      src={ASSISTANT_AVATAR_SRC}
      style={{
        width: size,
        height: size,
        background: "color-mix(in oklch, var(--color-accent) 16%, var(--surface))",
      }}
      width={size}
    />
  );
}

/**
 * Ảnh đại diện của người dùng — đúng tấm đang hiện cạnh nút thông báo.
 *
 * Chưa đặt ảnh thì hiện chữ cái đầu của tên, không rơi về một hình người chung
 * chung: trong một cuộc hội thoại, hai bên phải phân biệt được bằng mắt.
 */
export function UserAvatar({ size = 28, className = "" }: { size?: number; className?: string }) {
  const user = useAuth((state) => state.user);
  const label = user?.fullName || user?.email || "";
  const initials = getInitials(label);

  if (user?.avatarUrl) {
    return (
      <img
        alt=""
        aria-hidden="true"
        className={`shrink-0 rounded-full object-cover ${className}`}
        height={size}
        src={user.avatarUrl}
        style={{ width: size, height: size }}
        width={size}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-full border bg-[var(--surface)] font-bold text-[var(--text)] ${className}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
    >
      {initials}
    </span>
  );
}

function getInitials(value: string): string {
  const words = value.trim().split(/\s+/).filter(Boolean);
  return (
    words
      .slice(-2)
      .map((word) => word[0]?.toUpperCase())
      .join("") || "ND"
  );
}
