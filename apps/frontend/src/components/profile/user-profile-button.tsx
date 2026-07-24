"use client";

import { useRef, useState } from "react";
import { useAuth } from "@/lib/auth-store";
import { UserProfileDialog } from "./user-profile-dialog";

export function UserProfileButton({ onLogout }: { onLogout: () => void }) {
  const user = useAuth((state) => state.user);
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const initials = getInitials(user?.fullName || user?.email || "Hồ sơ");

  function closeDialog() {
    setIsOpen(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  }

  return (
    <>
      <button
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        aria-label={`Mở hồ sơ của ${user?.fullName || user?.email || "người dùng"}`}
        className="inline-flex h-9 w-9 items-center justify-center overflow-hidden rounded-md border bg-[var(--surface)] text-xs font-bold text-[#123B8F] transition hover:bg-[var(--surface-2)] active:translate-y-px"
        onClick={() => setIsOpen(true)}
        ref={triggerRef}
        title="Hồ sơ cá nhân"
        type="button"
      >
        {user?.avatarUrl ? (
          <span
            aria-hidden="true"
            className="h-full w-full bg-cover bg-center"
            style={{ backgroundImage: `url(${user.avatarUrl})` }}
          />
        ) : (
          initials
        )}
      </button>
      <UserProfileDialog isOpen={isOpen} onClose={closeDialog} onLogout={onLogout} />
    </>
  );
}

function getInitials(value: string): string {
  const words = value.trim().split(/\s+/).filter(Boolean);
  return (
    words
      .slice(-2)
      .map((word) => word[0]?.toUpperCase())
      .join("") || "HS"
  );
}
