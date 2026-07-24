"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ColorIcon } from "@/components/shared/color-icon";
import { useEffect, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { BASE } from "@/lib/api";
import { useAuth } from "@/lib/auth-store";
import { getNotifications, markAllRead } from "@/lib/mission-api";
import { useMissionFocus } from "@/lib/mission-focus-store";

export function NotificationBell({ onOpenMission }: { onOpenMission?: () => void }) {
  const role = useAuth((s) => s.user?.role);
  const token = useAuth((s) => s.token);
  const focusMission = useMissionFocus((s) => s.focusMission);
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  function openMission(missionId: string) {
    focusMission(missionId);
    onOpenMission?.();
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
        <ColorIcon name="notification" size={19} tone="amber" />
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
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-30 mt-2 w-80 overflow-hidden rounded-md border bg-[var(--surface)] shadow-lg">
            <div className="border-b px-4 py-2.5 text-sm font-semibold">Thông báo</div>
            <div className="max-h-96 overflow-y-auto">
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
                      onClick={() => openMission(n.missionId as string)}
                      className="block w-full border-b px-4 py-3 text-left transition last:border-0 hover:bg-[var(--surface-2)]"
                    >
                      <p className="text-sm font-medium">{n.title}</p>
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
