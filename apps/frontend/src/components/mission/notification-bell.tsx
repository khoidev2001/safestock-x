"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { incidentTypeLabel } from "@safestock/shared-types";
import { ColorIcon } from "@/components/shared/color-icon";
import { incidentIconName } from "@/lib/incident-visuals";
import { useEffect, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { BASE } from "@/lib/api";
import { useAuth } from "@/lib/auth-store";
import { getNotifications, markAllRead } from "@/lib/mission-api";
import { useMissionFocus } from "@/lib/mission-focus-store";

export function NotificationBell({
  onOpenMission,
}: {
  onOpenMission?: (missionId: string, fieldUpdateId?: string | null) => void;
}) {
  const role = useAuth((s) => s.user?.role);
  const token = useAuth((s) => s.token);
  const focusMission = useMissionFocus((s) => s.focusMission);
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  function openMission(missionId: string, fieldUpdateId?: string | null) {
    focusMission(missionId);
    onOpenMission?.(missionId, fieldUpdateId);
    setOpen(false);
  }

  const notifQuery = useQuery({
    queryKey: ["notifications"],
    queryFn: () => getNotifications(),
    enabled: Boolean(role),
    refetchInterval: 15000, // fallback nếu WebSocket rớt
  });

  // Realtime: backend derives the role room from the authenticated user.
  useEffect(() => {
    if (!token) return;
    const socket: Socket = io(BASE, {
      transports: ["websocket"],
      auth: { token },
    });
    socket.on("notification", () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    });
    return () => {
      socket.disconnect();
    };
  }, [token, queryClient]);

  const items = notifQuery.data ?? [];
  const unread = items.filter((n) => !n.read).length;

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && unread > 0) {
      await markAllRead();
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    }
  }

  return (
    <div className="relative">
      <button
        aria-label={`Thông báo${unread > 0 ? `, ${unread} chưa đọc` : ""}`}
        onClick={toggle}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-md border bg-[var(--surface)] transition hover:bg-[var(--surface-2)] active:translate-y-px"
        type="button"
      >
        {/* Còn việc chưa đọc thì chuông đỏ, không chỉ mỗi con số nhỏ ở góc:
            màu đọc được từ xa hơn một chữ số cỡ 10px. */}
        <ColorIcon name="notification" size={19} tone={unread > 0 ? "red" : "amber"} />
        {unread > 0 && (
          <span
            className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white"
            style={{ background: "var(--color-critical)" }}
          >
            {unread}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* z nhỏ là đủ: hộp này nằm trong header `sticky z-10` nên dù đặt bao
              nhiêu cũng chỉ được vẽ ở tầng 10 của trang. Thứ từng đè lên nó là
              lớp control của Leaflet, và chỗ sửa đúng nằm ở khung bản đồ
              (`isolate` trong incident-map), không phải ở đây. */}
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-30 mt-2 w-80 overflow-hidden rounded-md border bg-[var(--surface)] shadow-2xl">
            <div className="border-b px-4 py-2.5 text-sm font-semibold">Thông báo</div>
            {/* Cao tới 800px để đọc được nhiều thông báo trong một lượt mở, nhưng
                không vượt quá màn hình: hộp thả xuống từ chuông sát mép trên, nên
                trên laptop cao 768px thì 800px cứng làm phần cuối danh sách rơi ra
                ngoài màn hình mà không cuộn tới được. */}
            <div className="max-h-[min(800px,75vh)] overflow-y-auto">
              {items.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-[var(--text-muted)]">
                  Chưa có thông báo.
                </p>
              ) : (
                items.map((n) =>
                  n.missionId ? (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => openMission(n.missionId as string, n.fieldUpdateId)}
                      className="block w-full border-b px-4 py-3 text-left transition last:border-0 hover:bg-[var(--surface-2)]"
                    >
                      {/* Số hiệu trước tiêu đề: trong chuông có cả chục dòng của
                          nhiều nhiệm vụ khác nhau, không có số thì phải mở từng
                          dòng ra mới biết dòng nào thuộc việc mình đang theo. */}
                      {n.missionNo != null ? (
                        <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
                          Nhiệm vụ số {n.missionNo}
                        </p>
                      ) : null}
                      <p className="flex items-center gap-1.5 text-sm font-medium">
                        {n.incidentType ? (
                          <ColorIcon name={incidentIconName(n.incidentType)} size={16} tone="red" />
                        ) : null}
                        {n.title}
                      </p>
                      <NotificationFacts notification={n} />
                      <p className="mt-0.5 line-clamp-3 text-xs text-[var(--text-muted)]">
                        {n.body}
                      </p>
                      <p className="mt-1 text-[11px] font-semibold text-[var(--color-accent)]">
                        Xem nhiệm vụ →
                      </p>
                    </button>
                  ) : (
                    <div key={n.id} className="border-b px-4 py-3 last:border-0">
                      <p className="text-sm font-medium">{n.title}</p>
                      {/* body có thể dài khi kèm giải thích AI → gói 3 dòng, tránh tràn dropdown. */}
                      <p className="mt-0.5 line-clamp-3 text-xs text-[var(--text-muted)]">
                        {n.body}
                      </p>
                    </div>
                  ),
                )
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Dòng dữ kiện gọn của một thông báo: thiên tai gì, bao nhiêu người, ở đâu.
 *
 * Cùng ba thứ với thẻ thông báo nổi, để người đọc lại trong chuông không phải
 * dịch nghĩa lần nữa từ một cách trình bày khác.
 */
function NotificationFacts({
  notification,
}: {
  notification: {
    incidentType?: string | null;
    affectedPeople?: number | null;
    locationName?: string | null;
  };
}) {
  const { incidentType, affectedPeople, locationName } = notification;
  if (!incidentType && !affectedPeople && !locationName) return null;
  return (
    <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs">
      {incidentType ? (
        <span className="font-semibold" style={{ color: "var(--color-critical)" }}>
          {incidentTypeLabel(incidentType)}
        </span>
      ) : null}
      {affectedPeople ? (
        <span>
          <b>{affectedPeople.toLocaleString("vi")}</b> người
        </span>
      ) : null}
      {locationName ? <b>{locationName}</b> : null}
    </p>
  );
}
