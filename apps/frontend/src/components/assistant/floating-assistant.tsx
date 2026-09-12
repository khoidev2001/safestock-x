"use client";

import { ColorIcon } from "@/components/shared/color-icon";
import { useEffect, useRef, useState } from "react";
import { AssistantChat } from "./assistant-chat";
import { AssistantAvatar } from "./chat-avatars";
import { useIncidentAlerts } from "@/lib/incident-alert-store";

interface FloatingAssistantProps {
  warehouseId: string;
}

/**
 * Lời mời trò chuyện hiện bên cạnh nút, ngắt quãng.
 *
 * Chờ 30 giây đầu rồi mới chào: bật lên ngay khi trang vừa tải là chen ngang
 * đúng lúc người ta còn đang tìm thứ mình cần. Sau đó cứ một phút nhắc lại một
 * lần, mỗi lần đứng 8 giây rồi tự rút.
 */
const INVITE_FIRST_DELAY_MS = 30_000;
const INVITE_INTERVAL_MS = 60_000;
const INVITE_VISIBLE_MS = 8_000;

/** Đổi câu mỗi lượt: lặp y một câu bốn lần liên tiếp thì nó thành tiếng ồn. */
const INVITE_MESSAGES = [
  "Bạn có cần trợ giúp gì không?",
  "Cần tra nhanh tồn kho hay hạn dùng? Hỏi tôi nhé.",
  "Có tình huống cứu hộ cần lên phương án không?",
  "Muốn biết kho nào đang sẵn sàng điều phối?",
];

export function FloatingAssistant({ warehouseId }: FloatingAssistantProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [inviteIndex, setInviteIndex] = useState<number | null>(null);
  const [isInviteMuted, setIsInviteMuted] = useState(false);
  const [isHoveringTrigger, setIsHoveringTrigger] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  /**
   * Rê chuột vào nút là hiện lời mời ngay, không phải chờ hết nhịp.
   *
   * Người đã đưa chuột tới đó là người đang cân nhắc bấm — bắt họ đợi nửa phút để
   * biết cái nút này làm gì thì lời mời tới quá muộn. Lúc hover luôn dùng câu đầu:
   * nó là câu nói rõ nhất "tôi giúp được gì", còn ba câu gợi ý kia để dành cho lúc
   * tự chào, khi người dùng chưa hề nghĩ tới trợ lý.
   */
  const hoverInviteIndex = isHoveringTrigger && !isInviteMuted && !isOpen ? 0 : null;
  const visibleInviteIndex = inviteIndex ?? hoverInviteIndex;
  const inviteText = visibleInviteIndex == null ? null : INVITE_MESSAGES[visibleInviteIndex];
  const autoOpenReq = useIncidentAlerts((s) => s.autoOpenReq);
  const clearAutoOpen = useIncidentAlerts((s) => s.clearAutoOpen);

  // Sự cố nghiêm trọng (HIGH/CRITICAL) đã được AI giải thích → tự mở trợ lý để người dùng thấy ngay.
  useEffect(() => {
    if (autoOpenReq === 0) return;
    setIsOpen(true);
    setIsExpanded(true);
    clearAutoOpen();
  }, [autoOpenReq, clearAutoOpen]);

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

  /**
   * Nhịp chào hỏi.
   *
   * Ngừng hẳn khi cửa sổ chat đang mở (đã nói chuyện rồi thì không chào nữa) và
   * khi người dùng đã tự tay tắt lời mời — tắt một lần là thôi cả phiên, vì thứ
   * bị gạt đi rồi mà vẫn quay lại mỗi phút thì không còn là lời mời.
   */
  useEffect(() => {
    if (isOpen || isInviteMuted) {
      setInviteIndex(null);
      return;
    }

    // Hẹn giờ nối tiếp nhau chứ không dùng setInterval: khoảng chờ lần đầu khác
    // các lần sau, mà interval thì đếm đều từ lúc gắn — lần nhắc thứ hai sẽ lệch
    // đúng bằng khoảng chờ đầu tiên.
    let showTimer: ReturnType<typeof setTimeout> | undefined;
    let hideTimer: ReturnType<typeof setTimeout> | undefined;
    let round = 0;

    function scheduleInvite(delay: number) {
      showTimer = setTimeout(() => {
        setInviteIndex(round % INVITE_MESSAGES.length);
        round += 1;
        hideTimer = setTimeout(() => setInviteIndex(null), INVITE_VISIBLE_MS);
        scheduleInvite(INVITE_INTERVAL_MS);
      }, delay);
    }

    scheduleInvite(INVITE_FIRST_DELAY_MS);

    return () => {
      if (showTimer) clearTimeout(showTimer);
      if (hideTimer) clearTimeout(hideTimer);
    };
  }, [isInviteMuted, isOpen]);

  useEffect(() => {
    if (!isOpen || !isExpanded) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isExpanded, isOpen]);

  return (
    // Vùng bắt chuột phải bọc CẢ nút lẫn bong bóng. Chỉ bắt trên nút thì vừa đưa
    // chuột lên lời mời là nó biến mất ngay dưới con trỏ — không ai bấm vào nổi.
    <div
      className="fixed bottom-4 right-3 z-50 sm:bottom-6 sm:right-6"
      onMouseEnter={() => setIsHoveringTrigger(true)}
      onMouseLeave={() => setIsHoveringTrigger(false)}
    >
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
            <AssistantAvatar className="border" size={32} />
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold" id="floating-assistant-title">
                Trợ lý ảo Ứng Phó Nhanh
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
          onNavigateAway={() => {
            setIsOpen(false);
            setIsExpanded(false);
          }}
          compact
          isActive={isOpen}
          onLongResponse={() => setIsExpanded(true)}
          warehouseId={warehouseId}
        />
      </section>

      {/* Lời mời nằm NGAY TRÊN nút, canh phải cùng mép: bong bóng và cái mỏ neo ra
          nó phải đọc được là một cụm. Cả khối bấm được — ai đã đọc lời mời rồi thì
          bấm thẳng vào đó là mở chat, không phải nhắm lại xuống nút tròn. */}
      {inviteText ? (
        <div className="assistant-invite-enter assistant-bubble absolute bottom-[4.25rem] right-0 flex w-max max-w-[min(17rem,calc(100vw-2.5rem))] items-start gap-2 border bg-[var(--surface)] py-2.5 pl-4 pr-2.5 text-left shadow-lg sm:bottom-[4.75rem]">
          <button
            className="text-sm leading-snug text-[var(--text)]"
            onClick={() => {
              setInviteIndex(null);
              setIsOpen(true);
            }}
            type="button"
          >
            {inviteText}
          </button>
          <button
            aria-label="Tắt lời mời trò chuyện"
            className="-mt-0.5 shrink-0 rounded p-1 text-[var(--text-muted)] transition hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
            onClick={() => {
              setInviteIndex(null);
              setIsInviteMuted(true);
            }}
            title="Không nhắc nữa"
            type="button"
          >
            <ColorIcon mono name="close" size={14} />
          </button>
        </div>
      ) : null}

      <button
        ref={triggerRef}
        aria-expanded={isOpen}
        aria-hidden={isExpanded}
        aria-label={isOpen ? "Đóng cửa sổ trợ lý" : "Mở cửa sổ trợ lý ứng phó"}
        className={`flex h-14 w-14 items-center justify-center rounded-full border border-[var(--color-accent)] bg-[var(--color-accent)] text-[var(--color-accent-fg)] shadow-lg transition hover:brightness-95 active:translate-y-px ${
          isExpanded ? "pointer-events-none scale-90 opacity-0" : "scale-100 opacity-100"
        } ${isOpen || isExpanded || isHoveringTrigger ? "" : "assistant-bob"} ${
          isHoveringTrigger && !isExpanded ? "scale-110" : ""
        }`}
        // Bàn phím cũng phải thấy lời mời như chuột: người dùng Tab tới nút này
        // cần biết nó làm gì trước khi bấm Enter.
        onBlur={() => setIsHoveringTrigger(false)}
        onClick={() => {
          if (isOpen) setIsExpanded(false);
          setIsOpen(!isOpen);
        }}
        onFocus={() => setIsHoveringTrigger(true)}
        title={isOpen ? "Đóng trợ lý" : "Mở trợ lý ứng phó"}
        tabIndex={isExpanded ? -1 : 0}
        type="button"
      >
        {/* Khi đóng thì nút là khuôn mặt trợ lý — người dùng nhận ra "hỏi ai" ngay
            từ nút bấm, và đó cũng là khuôn mặt sẽ trả lời trong khung chat. Khi mở
            thì phải là dấu đóng, vì lúc đó nút đổi nghĩa. `mono` cho dấu đóng vì
            nền nút tô kín màu nhấn. */}
        {isOpen ? <ColorIcon mono name="close" size={22} /> : <AssistantAvatar size={40} />}
      </button>
    </div>
  );
}
