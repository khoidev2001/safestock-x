"use client";

import { Bot, MessageCircle, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AssistantChat } from "./assistant-chat";

interface FloatingAssistantProps {
  warehouseId: string;
  isHidden?: boolean;
}

export function FloatingAssistant({
  warehouseId,
  isHidden = false,
}: FloatingAssistantProps) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isHidden) {
      setIsOpen(false);
    }
  }, [isHidden]);

  useEffect(() => {
    if (!isOpen) return;

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setIsOpen(false);
      triggerRef.current?.focus();
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isOpen]);

  if (isHidden) return null;

  return (
    <div className="fixed bottom-4 right-3 z-50 sm:bottom-6 sm:right-6">
      <section
        aria-hidden={!isOpen}
        aria-labelledby="floating-assistant-title"
        className={`absolute bottom-16 right-0 flex h-[min(560px,calc(100dvh-7rem))] w-[min(380px,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-md border bg-[var(--surface)] shadow-xl ${
          isOpen ? "visible opacity-100" : "invisible pointer-events-none translate-y-2 opacity-0"
        } transition`}
        role="dialog"
      >
        <header className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[var(--color-accent)] text-[var(--color-accent-fg)]">
              <Bot aria-hidden="true" size={17} strokeWidth={1.8} />
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold" id="floating-assistant-title">
                Trợ lý kho
              </h2>
              <p className="truncate text-xs text-[var(--text-muted)]">Trả lời từ dữ liệu hiện tại</p>
            </div>
          </div>
          <button
            aria-label="Đóng trợ lý"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border transition hover:bg-[var(--surface-2)] active:translate-y-px"
            onClick={() => {
              setIsOpen(false);
              triggerRef.current?.focus();
            }}
            title="Đóng"
            type="button"
          >
            <X aria-hidden="true" size={16} />
          </button>
        </header>

        <AssistantChat compact isActive={isOpen} warehouseId={warehouseId} />
      </section>

      <button
        ref={triggerRef}
        aria-expanded={isOpen}
        aria-label={isOpen ? "Đóng trợ lý kho" : "Mở trợ lý kho"}
        className="flex h-14 w-14 items-center justify-center rounded-full border border-[var(--color-accent)] bg-[var(--color-accent)] text-[var(--color-accent-fg)] shadow-lg transition hover:brightness-95 active:translate-y-px"
        onClick={() => setIsOpen((currentValue) => !currentValue)}
        title={isOpen ? "Đóng trợ lý kho" : "Mở trợ lý kho"}
        type="button"
      >
        {isOpen ? <X aria-hidden="true" size={21} /> : <MessageCircle aria-hidden="true" size={22} />}
      </button>
    </div>
  );
}
