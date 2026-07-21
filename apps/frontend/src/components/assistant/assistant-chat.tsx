"use client";

import { useMutation } from "@tanstack/react-query";
import { ColorIcon } from "@/components/shared/color-icon";
import { useEffect, useRef, useState } from "react";
import { askAssistant } from "@/lib/assistant-api";
import { ApiError } from "@/lib/api";

interface ChatTurn {
  role: "user" | "assistant";
  text: string;
}

interface AssistantChatProps {
  warehouseId: string;
  compact?: boolean;
  isActive?: boolean;
  onLongResponse?: () => void;
}

const LONG_RESPONSE_LENGTH = 280;

const SUGGESTIONS = [
  "Thôn Tân Bình có 150 người mắc kẹt, đang mưa to.",
  "Còn bao nhiêu áo phao người lớn?",
  "Vật tư nào sắp hết hạn?",
  "Kho đang có sự cố gì không?",
  "Kho hiện có thể điều phối vật tư không?",
];

export function AssistantChat({
  warehouseId,
  compact = false,
  isActive = true,
  onLongResponse,
}: AssistantChatProps) {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const ask = useMutation({
    mutationFn: (question: string) => askAssistant(warehouseId, question),
    onSuccess: (response) => appendAssistantTurn(response.answer),
    onError: (error) => {
      appendAssistantTurn(getAssistantErrorMessage(error));
    },
  });

  useEffect(() => {
    if (isActive) inputRef.current?.focus();
  }, [isActive]);

  function scrollToLatest() {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    });
  }

  function appendAssistantTurn(text: string) {
    setTurns((currentTurns) => [...currentTurns, { role: "assistant", text }]);
    if (compact && isLongResponse(text)) onLongResponse?.();
    scrollToLatest();
  }

  function submit(question: string) {
    const normalizedQuestion = question.trim();
    if (!normalizedQuestion || ask.isPending) return;

    setTurns((currentTurns) => [
      ...currentTurns,
      { role: "user", text: normalizedQuestion },
    ]);
    setInput("");
    scrollToLatest();
    ask.mutate(normalizedQuestion);
  }

  return (
    <div className={compact ? "flex min-h-0 flex-1 flex-col" : "flex flex-col gap-4"}>
      <div
        ref={scrollRef}
        aria-live="polite"
        className={
          compact
            ? "flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto bg-[var(--surface-2)] p-3"
            : "flex min-h-[320px] flex-col gap-3 overflow-y-auto rounded-md border bg-[var(--surface)] p-4"
        }
        style={compact ? undefined : { maxHeight: "52vh" }}
      >
        {turns.length === 0 ? (
          <EmptyChat compact={compact} onSuggestion={submit} />
        ) : (
          turns.map((turn, index) => (
            <ChatBubble key={`${turn.role}-${index}`} turn={turn} />
          ))
        )}

        {ask.isPending ? (
          <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]" role="status">
            <ColorIcon className="animate-spin" name="loading" size={16} tone="blue" />
            Đang phân tích tình huống...
          </div>
        ) : null}
      </div>

      <form
        className={compact ? "flex items-center gap-2 border-t bg-[var(--surface)] p-3" : "flex items-center gap-2"}
        onSubmit={(event) => {
          event.preventDefault();
          submit(input);
        }}
      >
        <input
          ref={inputRef}
          aria-label="Câu hỏi cho trợ lý kho"
          className="min-w-0 flex-1 rounded-md border bg-[var(--surface)] px-3 py-2.5 text-sm outline-none transition focus:ring-2 focus:ring-[var(--color-accent)]"
          maxLength={500}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Nhập câu hỏi hoặc mô tả tình huống..."
          value={input}
        />
        <button
          aria-label="Gửi câu hỏi"
          className={`inline-flex items-center justify-center gap-2 rounded-md bg-[var(--color-accent)] text-sm font-semibold text-[var(--color-accent-fg)] transition hover:brightness-95 active:translate-y-px disabled:opacity-60 ${
            compact ? "h-10 w-10 shrink-0" : "px-4 py-2.5"
          }`}
          disabled={ask.isPending || !input.trim()}
          title="Gửi câu hỏi"
          type="submit"
        >
          <ColorIcon name="send" size={18} tone="blue" />
          {compact ? null : "Gửi"}
        </button>
      </form>
    </div>
  );
}

function isLongResponse(text: string): boolean {
  return text.length >= LONG_RESPONSE_LENGTH || text.split("\n").length >= 4;
}

function getAssistantErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return "Chưa thể kết nối để tra cứu. Vui lòng thử lại sau.";
  }
  if (error.status === 401) return "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.";
  if (error.status >= 500) return "Dịch vụ tra cứu đang tạm gián đoạn. Vui lòng thử lại sau.";
  return "Chưa tìm được câu trả lời phù hợp. Hãy thử hỏi ngắn gọn hơn.";
}

function EmptyChat({
  compact,
  onSuggestion,
}: {
  compact: boolean;
  onSuggestion: (suggestion: string) => void;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 py-6 text-center">
      <ColorIcon name="assistant" size={compact ? 30 : 34} tone="blue" />
      <div>
        <p className="text-sm font-semibold">Trợ lý ứng phó nhanh</p>
        <p className="mt-1 text-xs text-[var(--text-muted)]">Mô tả tình huống cứu hộ hoặc hỏi về dữ liệu kho.</p>
      </div>
      <div className={`flex flex-wrap justify-center gap-2 ${compact ? "max-w-xs" : ""}`}>
        {SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion}
            className="rounded-md border bg-[var(--surface)] px-3 py-1.5 text-xs font-medium transition hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] active:translate-y-px"
            onClick={() => onSuggestion(suggestion)}
            type="button"
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  );
}

function ChatBubble({ turn }: { turn: ChatTurn }) {
  const isUser = turn.role === "user";

  return (
    <div className={`flex gap-2.5 ${isUser ? "flex-row-reverse" : ""}`}>
      <span
        aria-hidden="true"
        className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
        style={{
          background: isUser
            ? "var(--surface)"
            : "color-mix(in oklch, var(--color-accent) 16%, var(--surface))",
          color: isUser ? "var(--text)" : "var(--color-accent)",
        }}
      >
        {isUser ? <ColorIcon name="user" size={17} tone="green" /> : <ColorIcon name="assistant" size={17} tone="blue" />}
      </span>
      <div
        className="max-w-[82%] whitespace-pre-wrap rounded-md px-3 py-2 text-sm leading-relaxed"
        style={{
          background: isUser ? "var(--color-accent)" : "var(--surface)",
          color: isUser ? "var(--color-accent-fg)" : "var(--text)",
        }}
      >
        {turn.text}
      </div>
    </div>
  );
}
