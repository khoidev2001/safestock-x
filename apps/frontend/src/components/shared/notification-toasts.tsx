"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { incidentTypeLabel } from "@safestock/shared-types";
import { ColorIcon } from "./color-icon";
import { incidentIconName } from "@/lib/incident-visuals";
import { isProgressNotification, isStickyNotification } from "@/lib/notification-routing";
import { CloseGlyph } from "./close-glyph";

export interface ToastItem {
  id: string;
  kind: string;
  title: string;
  body: string;
  missionId?: string | null;
  /** Số hiệu nhiệm vụ — thẻ phải nói được "việc này là nhiệm vụ nào". */
  missionNo?: number | null;
  /** Khoản mượn liên xã — có nó thì thẻ dựng hai nút Đồng ý / Từ chối. */
  loanId?: string | null;
  /** Loại thiên tai của nhiệm vụ — quyết định biểu tượng và nhãn trên thẻ. */
  incidentType?: string | null;
  affectedPeople?: number | null;
  locationName?: string | null;
}

const AUTO_DISMISS_SECONDS = 6;

/**
 * Thẻ thông báo toạt ra ở góc phải dưới, giống Zalo.
 *
 * Trước đây mọi thông báo chỉ nằm trong chuông ở góc: muốn biết có việc gì phải
 * chủ động mở ra xem. Lúc đang chạy nhiều việc thì không ai nhớ mở, nên một sự
 * cố mới hay một kho báo xong hàng có thể nằm đó rất lâu mà không ai hay.
 *
 * Sự cố cảm biến ở lại cho tới khi có người bấm; mọi loại khác tự tắt sau vài
 * giây. Để tất cả ở lại thì màn hình đầy thẻ và người ta bấm tắt theo phản xạ,
 * đúng lúc đó cái quan trọng cũng bị tắt cùng.
 *
 * Đặt `aria-live="polite"` chứ không phải `assertive`: trình đọc màn hình đọc
 * xen vào giữa câu người dùng đang nghe là mất mạch, mà thông báo ở đây không
 * cấp bách tới mức đó.
 */
export function NotificationToasts({
  items,
  onOpen,
  onDismiss,
  onDecideLoan,
}: {
  items: ToastItem[];
  onOpen?: (item: ToastItem) => void;
  onDismiss?: (id: string) => void;
  /** Trả lời yêu cầu mượn ngay trên thẻ. Không truyền thì thẻ chỉ để đọc. */
  onDecideLoan?: (loanId: string, approve: boolean) => Promise<void> | void;
}) {
  if (items.length === 0) return null;
  return (
    <div
      aria-live="polite"
      aria-label="Thông báo mới"
      /* Góc phải DƯỚI, giống Zalo. Góc trên đè lên thanh điều hướng và nút của
         trang, nên thông báo vừa che mất chỗ người ta đang bấm vừa dễ bị bấm nhầm.

         `flex-col-reverse`: thông báo mới nhất nằm sát đáy, cái cũ bị đẩy lên
         trên. Xếp xuôi thì cái mới rơi ra ngoài tầm mắt ở phía trên chồng. */
      className="pointer-events-none fixed bottom-4 right-4 z-[1200] flex max-h-[min(70vh,32rem)] w-[min(22rem,calc(100vw-2rem))] flex-col-reverse gap-2 overflow-y-auto"
    >
      {items.map((item) => (
        <Toast
          item={item}
          key={item.id}
          onDecideLoan={onDecideLoan}
          onDismiss={onDismiss}
          onOpen={onOpen}
        />
      ))}
    </div>
  );
}

function Toast({
  item,
  onOpen,
  onDismiss,
  onDecideLoan,
}: {
  item: ToastItem;
  onOpen?: (item: ToastItem) => void;
  onDismiss?: (id: string) => void;
  onDecideLoan?: (loanId: string, approve: boolean) => Promise<void> | void;
}) {
  // Thẻ có hành động thì KHÔNG tự tắt. Tự tắt một thẻ đang chờ người quyết là
  // vứt mất chính cái việc phải làm — người dùng ngoảnh đi ba giây là mất.
  const hasActions = Boolean(item.loanId && onDecideLoan);
  const [sending, setSending] = useState<"yes" | "no" | null>(null);
  const sticky = isStickyNotification(item.kind) || hasActions;
  const [secondsLeft, setSecondsLeft] = useState(AUTO_DISMISS_SECONDS);
  /**
   * Con trỏ đang ở trên thẻ (hoặc bàn phím đang đứng trong thẻ) thì dừng đồng hồ.
   *
   * Người dùng đưa chuột tới là đang đọc, hoặc đang định bấm. Thẻ biến mất giữa
   * lúc đó vừa cướp mất câu đang đọc dở, vừa đẩy cú bấm xuống thứ nằm phía dưới.
   */
  const [isHovered, setIsHovered] = useState(false);
  // Giữ trong ref để đồng hồ đếm không phải dựng lại mỗi khi component vẽ lại —
  // dựng lại là đồng hồ nhảy về đầu và thẻ không bao giờ tự tắt.
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  useEffect(() => {
    if (sticky || isHovered) return;
    // Hàm cập nhật state PHẢI thuần: React được phép gọi lại nó lúc đang vẽ
    // (và ở chế độ nghiêm ngặt thì gọi hai lần). Gọi `onDismiss` ngay trong đây
    // là đổi state của layout cha giữa lúc Toast đang vẽ — đúng cảnh báo
    // "Cannot update a component while rendering a different component".
    // Ở đây chỉ trừ đi một giây; việc tắt thẻ để cho effect bên dưới làm.
    const timer = setInterval(() => {
      setSecondsLeft((seconds) => (seconds <= 0 ? 0 : seconds - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [sticky, isHovered]);

  // Hết giờ thì mới báo ra ngoài, và báo từ effect — tức là sau khi vẽ xong,
  // nơi việc đổi state của component khác là hợp lệ.
  useEffect(() => {
    if (sticky || secondsLeft > 0) return;
    dismissRef.current?.(item.id);
  }, [item.id, sticky, secondsLeft]);

  const open = useCallback(() => onOpen?.(item), [item, onOpen]);

  /**
   * Thẻ nào có nhiệm vụ thì CẢ THẺ bấm được, không chỉ mỗi dòng chữ "Mở nhiệm vụ".
   *
   * Cái link nhỏ ở góc là một mục tiêu bấm rộng chừng hai centimet trên màn hình
   * điện thoại, giữa lúc người ta đang vừa đi vừa bấm. Bấm trượt thì thẻ tự tắt
   * sau vài giây và việc đó coi như chưa từng hiện ra.
   */
  const isClickable = Boolean(onOpen && item.missionId);
  // Cảnh báo: thẻ có tình huống, hoặc loại thông báo vốn phải ở lại tới khi có
  // người bấm. Viền đỏ và chuông đỏ chỉ dành cho nhóm này — tô đỏ mọi thứ thì
  // màu đỏ thôi mang nghĩa "khẩn".
  const isAlert = sticky || Boolean(item.incidentType);
  // Thẻ báo tiến độ kho: nền trắng phẳng, KHÔNG viền, chỉ còn bóng đổ để tách khỏi
  // trang. Bộ cánh cảnh báo (viền đỏ + nền pha đỏ + bóng đỏ) để dành cho việc thật
  // sự cần phản ứng gấp.
  const plainFrame = isProgressNotification(item.kind);
  const iconName = item.incidentType
    ? incidentIconName(item.incidentType)
    : isAlert
      ? "incident"
      : "notification";

  return (
    <article
      className={`pointer-events-auto rounded-lg bg-[var(--surface)] p-3.5 shadow-lg transition ${
        plainFrame ? "" : "border"
      } ${isClickable ? "cursor-pointer hover:brightness-[0.98]" : ""}`}
      style={
        isAlert && !plainFrame
          ? {
              // Viền mảnh 1px, phần "nổi lên" giao cho bóng đổ.
              //
              // Viền dày kéo mắt vào chính cái khung, và trên nền sáng thì hai
              // pixel đỏ chạy quanh chữ đỏ đọc thành một khối đặc. Bóng đổ pha
              // đỏ tách thẻ ra khỏi nền mà không thêm nét nào lên phần chữ.
              borderColor: "var(--color-critical)",
              borderWidth: 1,
              background: "color-mix(in oklch, var(--color-critical) 4%, var(--surface))",
              boxShadow:
                "0 12px 32px -12px color-mix(in oklch, var(--color-critical) 55%, transparent), 0 4px 12px -6px rgb(0 0 0 / 0.25)",
            }
          : undefined
      }
      role={sticky ? "alert" : undefined}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onFocusCapture={() => setIsHovered(true)}
      onBlurCapture={() => setIsHovered(false)}
      onClick={isClickable ? open : undefined}
    >
      <div className="flex items-start gap-2.5">
        <ColorIcon name={iconName} size={22} tone={isAlert ? "red" : "blue"} />
        <div className="min-w-0 flex-1">
          {/* Số hiệu đứng TRÊN tiêu đề: người trực đang chạy mấy việc cùng lúc thì
              câu hỏi đầu tiên khi thẻ hiện ra là "của nhiệm vụ nào", rồi mới tới
              "chuyện gì". Đọc ngược thứ tự đó là phải đọc hết thẻ mới biết có phải
              việc mình đang theo hay không. */}
          {item.missionNo != null ? (
            <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
              Nhiệm vụ số {item.missionNo}
            </p>
          ) : null}
          <p className="text-sm font-semibold leading-snug">{item.title}</p>
          {/* Ba dữ kiện người trực cần trước tiên: thiên tai gì, bao nhiêu người,
              ở đâu. Tách khỏi câu văn và in đậm để đọc được trong một cái liếc. */}
          {(item.incidentType || item.affectedPeople || item.locationName) && (
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
              {item.incidentType ? (
                <span
                  className="rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide"
                  style={{
                    background: "color-mix(in oklch, var(--color-critical) 12%, transparent)",
                    color: "var(--color-critical)",
                  }}
                >
                  {incidentTypeLabel(item.incidentType)}
                </span>
              ) : null}
              {item.affectedPeople ? (
                <span>
                  <b className="text-sm font-bold">{item.affectedPeople.toLocaleString("vi")}</b>{" "}
                  người
                </span>
              ) : null}
              {item.locationName ? (
                <span className="inline-flex items-center gap-1">
                  <ColorIcon name="location" size={13} tone="red" />
                  <b className="text-sm font-bold">{item.locationName}</b>
                </span>
              ) : null}
            </p>
          )}
          {/* Cho phép cao tới 6 dòng thay vì 3: nhiều thông báo bị cắt đúng chỗ
              có con số hoặc tên kho, mà đó lại là phần người đọc cần nhất. */}
          <p className="mt-1 line-clamp-6 whitespace-pre-line text-xs leading-relaxed text-[var(--text-muted)]">
            {item.body}
          </p>
          {hasActions ? (
            <div className="mt-2.5 flex gap-2">
              <button
                className="rounded-md px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                disabled={sending !== null}
                onClick={async (event) => {
                  // Nút nằm TRONG thẻ bấm được: không chặn nổi bọt thì đồng ý xong
                  // màn hình nhảy luôn sang nhiệm vụ, người dùng mất dấu việc vừa làm.
                  event.stopPropagation();
                  setSending("yes");
                  try {
                    await onDecideLoan?.(item.loanId as string, true);
                    onDismiss?.(item.id);
                  } finally {
                    setSending(null);
                  }
                }}
                style={{ background: "var(--color-ready)" }}
                type="button"
              >
                {sending === "yes" ? "Đang gửi…" : "Đồng ý"}
              </button>
              <button
                className="rounded-md border px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
                disabled={sending !== null}
                onClick={async (event) => {
                  event.stopPropagation();
                  setSending("no");
                  try {
                    await onDecideLoan?.(item.loanId as string, false);
                    onDismiss?.(item.id);
                  } finally {
                    setSending(null);
                  }
                }}
                style={{ borderColor: "var(--color-critical)", color: "var(--color-critical)" }}
                type="button"
              >
                {sending === "no" ? "Đang gửi…" : "Từ chối"}
              </button>
            </div>
          ) : null}
          {isClickable ? (
            // Vẫn giữ một nút thật cho bàn phím và trình đọc màn hình: cả thẻ bấm
            // được là tiện cho chuột, nhưng gắn hành động vào <article> thì không
            // tab tới được, và người dùng bàn phím mất hẳn đường mở nhiệm vụ.
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                open();
              }}
              className="mt-2 text-xs font-semibold text-[var(--color-accent)] hover:underline"
            >
              Xem nhiệm vụ ngay
            </button>
          ) : null}
        </div>
        <button
          type="button"
          aria-label="Đóng thông báo"
          onClick={(event) => {
            event.stopPropagation();
            onDismiss?.(item.id);
          }}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-[var(--text-muted)] transition hover:bg-[var(--surface-2)]"
        >
          <CloseGlyph />
        </button>
      </div>
      {/* Đang rê chuột thì đồng hồ đứng yên, và con số đứng yên nói điều đó rõ
          hơn một câu chú thích thêm vào. */}
      {!sticky ? (
        <p className="mt-1.5 text-right text-[10px] text-[var(--text-muted)]">
          tự đóng sau {secondsLeft}s
        </p>
      ) : null}
    </article>
  );
}
