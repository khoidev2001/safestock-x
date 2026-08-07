"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ColorIcon } from "./color-icon";
import { isStickyNotification } from "@/lib/notification-routing";

export interface ToastItem {
  id: string;
  kind: string;
  title: string;
  body: string;
  missionId?: string | null;
  /** Khoản mượn liên xã — có nó thì thẻ dựng hai nút Đồng ý / Từ chối. */
  loanId?: string | null;
}

const GIAY_TU_TAT = 6;

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
  onDecideLoan?: (loanId: string, dongY: boolean) => Promise<void> | void;
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
  onDecideLoan?: (loanId: string, dongY: boolean) => Promise<void> | void;
}) {
  // Thẻ có hành động thì KHÔNG tự tắt. Tự tắt một thẻ đang chờ người quyết là
  // vứt mất chính cái việc phải làm — người dùng ngoảnh đi ba giây là mất.
  const coHanhDong = Boolean(item.loanId && onDecideLoan);
  const [dangGui, setDangGui] = useState<"yes" | "no" | null>(null);
  const sticky = isStickyNotification(item.kind) || coHanhDong;
  const [conLai, setConLai] = useState(GIAY_TU_TAT);
  // Giữ trong ref để đồng hồ đếm không phải dựng lại mỗi khi component vẽ lại —
  // dựng lại là đồng hồ nhảy về đầu và thẻ không bao giờ tự tắt.
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  useEffect(() => {
    if (sticky) return;
    const timer = setInterval(() => {
      setConLai((giay) => {
        if (giay <= 1) {
          clearInterval(timer);
          dismissRef.current?.(item.id);
          return 0;
        }
        return giay - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [item.id, sticky]);

  const mo = useCallback(() => onOpen?.(item), [item, onOpen]);

  return (
    <article
      className="pointer-events-auto rounded-lg border bg-[var(--surface)] p-3.5 shadow-lg"
      style={sticky ? { borderColor: "var(--color-critical)" } : undefined}
      role={sticky ? "alert" : undefined}
    >
      <div className="flex items-start gap-2.5">
        <ColorIcon
          name={sticky ? "incident" : "notification"}
          size={18}
          tone={sticky ? "red" : "blue"}
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-snug">{item.title}</p>
          {/* Cho phép cao tới 6 dòng thay vì 3: nhiều thông báo bị cắt đúng chỗ
              có con số hoặc tên kho, mà đó lại là phần người đọc cần nhất. */}
          <p className="mt-0.5 line-clamp-6 whitespace-pre-line text-xs leading-relaxed text-[var(--text-muted)]">
            {item.body}
          </p>
          {coHanhDong ? (
            <div className="mt-2.5 flex gap-2">
              <button
                className="rounded-md px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                disabled={dangGui !== null}
                onClick={async () => {
                  setDangGui("yes");
                  try {
                    await onDecideLoan?.(item.loanId as string, true);
                    onDismiss?.(item.id);
                  } finally {
                    setDangGui(null);
                  }
                }}
                style={{ background: "var(--color-ready)" }}
                type="button"
              >
                {dangGui === "yes" ? "Đang gửi…" : "Đồng ý"}
              </button>
              <button
                className="rounded-md border px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
                disabled={dangGui !== null}
                onClick={async () => {
                  setDangGui("no");
                  try {
                    await onDecideLoan?.(item.loanId as string, false);
                    onDismiss?.(item.id);
                  } finally {
                    setDangGui(null);
                  }
                }}
                style={{ borderColor: "var(--color-critical)", color: "var(--color-critical)" }}
                type="button"
              >
                {dangGui === "no" ? "Đang gửi…" : "Từ chối"}
              </button>
            </div>
          ) : null}
          {onOpen && item.missionId ? (
            <button
              type="button"
              onClick={mo}
              className="mt-2 text-xs font-semibold text-[var(--color-accent)] hover:underline"
            >
              Mở nhiệm vụ
            </button>
          ) : null}
        </div>
        <button
          type="button"
          aria-label="Đóng thông báo"
          onClick={() => onDismiss?.(item.id)}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-lg leading-none text-[var(--text-muted)] transition hover:bg-[var(--surface-2)]"
        >
          ×
        </button>
      </div>
      {!sticky ? (
        <p className="mt-1.5 text-right text-[10px] text-[var(--text-muted)]">
          tự đóng sau {conLai}s
        </p>
      ) : null}
    </article>
  );
}
