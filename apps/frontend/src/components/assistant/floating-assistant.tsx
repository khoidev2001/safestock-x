"use client";

import { ColorIcon } from "@/components/shared/color-icon";
import { useEffect, useRef, useState } from "react";
import { AssistantChat } from "./assistant-chat";
import { useIncidentAlerts } from "@/lib/incident-alert-store";

interface FloatingAssistantProps {
  warehouseId: string;
  isHidden?: boolean;
}

export function FloatingAssistant({ warehouseId, isHidden = false }: FloatingAssistantProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const autoOpenReq = useIncidentAlerts((s) => s.autoOpenReq);
  const clearAutoOpen = useIncidentAlerts((s) => s.clearAutoOpen);

  useEffect(() => {
    if (isHidden) {
      setIsOpen(false);
      setIsExpanded(false);
    }
  }, [isHidden]);

  // Sự cố nghiêm trọng (HIGH/CRITICAL) đã được AI giải thích → tự mở trợ lý để người dùng thấy ngay.
  useEffect(() => {
    if (autoOpenReq === 0 || isHidden) return;
    setIsOpen(true);
    setIsExpanded(true);
    clearAutoOpen();
  }, [autoOpenReq, isHidden, clearAutoOpen]);

  useEffect(() => {
    if (!isOpen) return;

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (isExpanded) {
        setIsExpanded(false);
        return;
      }
      setIsOpen(false);
      triggerRef.current?.focus();
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isExpanded, isOpen]);

  useEffect(() => {
    if (!isOpen || !isExpanded) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isExpanded, isOpen]);

  if (isHidden) return null;

  return (
    <div className="fixed bottom-4 right-3 z-50 sm:bottom-6 sm:right-6">
      <button
        aria-label="Thu nhỏ cửa sổ trợ lý"
        className={`fixed inset-0 border-0 bg-slate-950/30 p-0 backdrop-blur-[2px] transition-opacity duration-500 motion-reduce:transition-none ${
          isOpen && isExpanded ? "visible opacity-100" : "invisible pointer-events-none opacity-0"
        }`}
        onClick={() => setIsExpanded(false)}
        tabIndex={-1}
        type="button"
      />

      <section
        aria-hidden={!isOpen}
        aria-labelledby="floating-assistant-title"
        aria-modal={isExpanded}
        className={`fixed flex flex-col overflow-hidden rounded-md border bg-[var(--surface)] shadow-2xl transition-[width,height,bottom,right,transform,opacity] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${
          isExpanded
            ? "bottom-1/2 right-1/2 h-[calc(100dvh-1.5rem)] w-[calc(100vw-1.5rem)] translate-x-1/2 translate-y-1/2 sm:h-[min(720px,calc(100dvh-3rem))] sm:w-[min(760px,calc(100vw-3rem))]"
            : "bottom-20 right-3 h-[min(560px,calc(100dvh-7rem))] w-[min(380px,calc(100vw-1.5rem))] translate-x-0 translate-y-0 sm:bottom-24 sm:right-6"
        } ${
          isOpen
            ? "visible scale-100 opacity-100"
            : "invisible pointer-events-none scale-95 opacity-0"
        }`}
        role="dialog"
      >
        <header className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[var(--color-accent)] text-[var(--color-accent-fg)]">
              <ColorIcon name="assistant" size={19} tone="blue" />
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold" id="floating-assistant-title">
                Trợ lý ứng phó nhanh
              </h2>
              <p className="truncate text-xs text-[var(--text-muted)]">
                Phân tích tình huống và dữ liệu kho
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              aria-label={isExpanded ? "Thu nhỏ cửa sổ trợ lý" : "Mở rộng cửa sổ trợ lý"}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border transition hover:bg-[var(--surface-2)] active:translate-y-px"
              onClick={() => setIsExpanded((currentValue) => !currentValue)}
              title={isExpanded ? "Thu nhỏ" : "Mở rộng"}
              type="button"
            >
              <ColorIcon name={isExpanded ? "shrink" : "expand"} size={18} tone="blue" />
            </button>
            <button
              aria-label="Đóng cửa sổ trợ lý"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border transition hover:bg-[var(--surface-2)] active:translate-y-px"
              onClick={() => {
                setIsOpen(false);
                setIsExpanded(false);
                triggerRef.current?.focus();
              }}
              title="Đóng"
              type="button"
            >
              <ColorIcon name="close" size={18} tone="red" />
            </button>
          </div>
        </header>

        <AssistantChat
          compact
          isActive={isOpen}
          onLongResponse={() => setIsExpanded(true)}
          warehouseId={warehouseId}
        />
      </section>

      <button
        ref={triggerRef}
        aria-expanded={isOpen}
        aria-hidden={isExpanded}
        aria-label={isOpen ? "Đóng cửa sổ trợ lý" : "Mở cửa sổ trợ lý ứng phó"}
        className={`flex h-14 w-14 items-center justify-center rounded-full border border-[var(--color-accent)] bg-[var(--color-accent)] text-[var(--color-accent-fg)] shadow-lg transition hover:brightness-95 active:translate-y-px ${
          isExpanded ? "pointer-events-none scale-90 opacity-0" : "scale-100 opacity-100"
        }`}
        onClick={() => {
          if (isOpen) setIsExpanded(false);
          setIsOpen(!isOpen);
        }}
        title={isOpen ? "Đóng trợ lý" : "Mở trợ lý ứng phó"}
        tabIndex={isExpanded ? -1 : 0}
        type="button"
      >
        {isOpen ? (
          <ColorIcon name="close" size={22} tone="red" />
        ) : (
          <ColorIcon name="message" size={24} tone="blue" />
        )}
      </button>
    </div>
  );
}
