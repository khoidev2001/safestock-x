"use client";

import { useMutation } from "@tanstack/react-query";
import { ColorIcon } from "@/components/shared/color-icon";
import { AssistantAvatar, UserAvatar } from "./chat-avatars";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { streamAssistant } from "@/lib/assistant-api";
import { ApiError } from "@/lib/api";
import { useIncidentAlerts } from "@/lib/incident-alert-store";

interface ChatTurn {
  role: "user" | "assistant";
  text: string;
  kind?: "alert"; // bong bóng cảnh báo AI tự sinh (khác câu trả lời hỏi-đáp thường)
  /**
   * Lời kể gốc để mở thẳng luồng điều phối.
   *
   * Có giá trị khi backend nhận ra câu hỏi đang mô tả một sự việc cần cứu hộ.
   * Trợ lý nghe xong rồi thôi là bỏ dở đúng lúc cần hành động — người trực phải
   * tự nhớ đường sang tab điều phối rồi gõ lại y nguyên những gì vừa kể.
   */
  dispatchFrom?: string;
}

interface AssistantChatProps {
  warehouseId: string;
  compact?: boolean;
  isActive?: boolean;
  onLongResponse?: () => void;
  /** Đóng khung trợ lý trước khi chuyển trang; trợ lý nổi truyền vào. */
  onNavigateAway?: () => void;
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
  onNavigateAway,
}: AssistantChatProps) {
  const router = useRouter();
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const renderedAlertIds = useRef<Set<string>>(new Set());
  const abortRef = useRef<AbortController | null>(null);
  const alerts = useIncidentAlerts((s) => s.alerts);

  /**
   * Ghi đè bong bóng trả lời đang dở.
   *
   * Chữ chảy về từng mẩu nên không thể thêm bong bóng mới mỗi lần; phải sửa đúng
   * bong bóng cuối. Kiểm `role` trước khi sửa vì cảnh báo sự cố có thể chen vào
   * giữa lúc đang chảy — sửa nhầm là xoá mất cảnh báo.
   */
  function updateLastBubble(text: string, dispatchFrom?: string) {
    setTurns((currentTurns) => {
      const lastIndex = currentTurns.length - 1;
      if (
        lastIndex < 0 ||
        currentTurns[lastIndex].role !== "assistant" ||
        currentTurns[lastIndex].kind === "alert"
      ) {
        return [...currentTurns, { role: "assistant", text, dispatchFrom }];
      }
      const updated = [...currentTurns];
      updated[lastIndex] = { ...updated[lastIndex], text, dispatchFrom };
      return updated;
    });
    scrollToLatest();
  }

  const ask = useMutation({
    mutationFn: async (question: string) => {
      abortRef.current?.abort();
      const abortController = new AbortController();
      abortRef.current = abortController;

      // KHÔNG đặt sẵn bong bóng rỗng: `capNhatBongBongCuoi` tự thêm khi mẩu chữ
      // đầu tiên về. Bong bóng rỗng đứng cạnh dòng "đang phân tích" là một ô trắng
      // trơ ra không rõ nghĩa, mà lúc AI chết thì nó nằm lại vĩnh viễn.
      let answer = "";
      let isEmergency = false;
      let errorText: string | null = null;

      for await (const chunk of streamAssistant(warehouseId, question, abortController.signal)) {
        if (chunk.emergency) isEmergency = true;
        if (chunk.error) {
          errorText = chunk.error;
          continue;
        }
        // `replace` THAY trọn câu chứ không nối thêm: lớp chống bịa số ở ai-service
        // chỉ chốt được sau khi đọc hết, nên nó gửi lại nguyên câu đã kiểm.
        if (chunk.replace !== undefined) answer = chunk.replace;
        else if (chunk.delta) answer += chunk.delta;
        else continue;
        updateLastBubble(answer, isEmergency ? question : undefined);
      }

      const finalAnswer =
        answer.trim() || errorText || "Trợ lý AI tạm thời không phản hồi. Thử lại sau.";
      updateLastBubble(finalAnswer, isEmergency ? question : undefined);
      if (compact && isLongResponse(finalAnswer)) onLongResponse?.();
    },
    onError: (error) => {
      // Người dùng tự bỏ ngang thì không phải lỗi, đừng dán câu báo lỗi vào mặt họ.
      if (error instanceof DOMException && error.name === "AbortError") return;
      updateLastBubble(getAssistantErrorMessage(error));
    },
  });

  useEffect(() => {
    if (isActive) inputRef.current?.focus();
  }, [isActive]);

  // Rời màn hình giữa lúc đang chảy thì cắt luôn: mô hình chạy trên card dùng
  // chung, sinh chữ cho một khung đã đóng là lấy mất chỗ của lượt hỏi kế tiếp.
  useEffect(() => () => abortRef.current?.abort(), []);

  // Trộn cảnh báo AI (sự cố mới đã giải thích) thành bong bóng chủ động; dedupe theo id.
  useEffect(() => {
    const fresh = alerts.filter((a) => !renderedAlertIds.current.has(a.id));
    if (fresh.length === 0) return;
    fresh.forEach((a) => renderedAlertIds.current.add(a.id));
    setTurns((current) => [
      ...current,
      ...fresh.map((a): ChatTurn => ({
        role: "assistant",
        kind: "alert",
        text: `⚠️ Cảnh báo mới — ${a.title}\n${a.explanation}`,
      })),
    ]);
    scrollToLatest();
  }, [alerts]);

  function scrollToLatest() {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    });
  }

  /** Mở luồng điều phối với lời kể đã điền sẵn — không bắt gõ lại. */
  function openDispatch(description: string) {
    onNavigateAway?.();
    router.push(`/mission?describe=${encodeURIComponent(description)}`);
  }

  function submit(question: string) {
    const normalizedQuestion = question.trim();
    if (!normalizedQuestion || ask.isPending) return;

    setTurns((currentTurns) => [...currentTurns, { role: "user", text: normalizedQuestion }]);
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
            <ChatBubble key={`${turn.role}-${index}`} turn={turn} onDispatch={openDispatch} />
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
        className={
          compact
            ? "flex items-center gap-2 border-t bg-[var(--surface)] p-3"
            : "flex items-center gap-2"
        }
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
          {/* Nền nút gửi là màu nhấn đặc — hình lấy màu chữ của nút. */}
          <ColorIcon mono name="send" size={18} />
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
      <AssistantAvatar size={compact ? 48 : 56} />
      <div>
        <p className="text-sm font-semibold">Trợ lý ứng phó nhanh</p>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          Mô tả tình huống cứu hộ hoặc hỏi về dữ liệu kho.
        </p>
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

function ChatBubble({ turn, onDispatch }: { turn: ChatTurn; onDispatch: (text: string) => void }) {
  const isUser = turn.role === "user";
  const isAlert = turn.kind === "alert";

  return (
    <div className={`flex gap-2.5 ${isUser ? "flex-row-reverse" : ""}`}>
      {/* Cảnh báo sự cố vẫn giữ hình tam giác đỏ: nó không phải lời trợ lý nói,
          mà là hệ thống chen vào giữa cuộc hội thoại — đeo mặt trợ lý cho nó thì
          người đọc tưởng mô hình vừa tự kết luận có sự cố. */}
      {isUser ? (
        <UserAvatar className="mt-0.5" size={28} />
      ) : isAlert ? (
        <span
          aria-hidden="true"
          className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
          style={{
            background: "color-mix(in oklch, var(--color-critical) 18%, var(--surface))",
            color: "var(--color-critical)",
          }}
        >
          <ColorIcon name="warning" size={17} tone="red" />
        </span>
      ) : (
        <AssistantAvatar className="mt-0.5" size={28} />
      )}
      <div
        className="max-w-[82%] whitespace-pre-wrap rounded-md px-3 py-2 text-sm leading-relaxed"
        style={{
          background: isUser
            ? "var(--color-accent)"
            : isAlert
              ? "color-mix(in oklch, var(--color-critical) 10%, transparent)"
              : "var(--surface)",
          color: isUser ? "var(--color-accent-fg)" : "var(--text)",
          border: isAlert
            ? "1px solid color-mix(in oklch, var(--color-critical) 35%, transparent)"
            : undefined,
        }}
      >
        {turn.text}
        {turn.dispatchFrom ? (
          <button
            type="button"
            onClick={() => onDispatch(turn.dispatchFrom as string)}
            className="mt-3 inline-flex items-center gap-2 rounded-md bg-[var(--color-accent)] px-3 py-2 text-xs font-semibold text-[var(--color-accent-fg)] transition hover:brightness-95 active:translate-y-px"
          >
            {/* Nút cũng tô kín màu nhấn — hình một màu theo màu chữ của nút. */}
            <ColorIcon mono name="mission" size={15} />
            Mở điều phối cứu hộ cho tình huống này
          </button>
        ) : null}
      </div>
    </div>
  );
}
