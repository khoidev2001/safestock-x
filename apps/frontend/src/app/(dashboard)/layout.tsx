"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { BASE } from "@/lib/api";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { FloatingAssistant } from "@/components/assistant/floating-assistant";
import { useIncidentAlertsBridge } from "@/components/assistant/use-incident-alerts";
import { getOpenIncidents } from "@/lib/dashboard-api";
import { useAuth } from "@/lib/auth-store";
import { useWarehouse } from "@/lib/use-warehouse";
import { NotificationToasts, type ToastItem } from "@/components/shared/notification-toasts";
import { useMissionFocus } from "@/lib/mission-focus-store";
import { missionDeepLink } from "@/lib/mission-inbox-state";
import { getNavItem, navItems } from "@/lib/dashboard-nav";
import { roleHasPermission } from "@safestock/shared-types";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const token = useAuth((state) => state.token);
  const user = useAuth((state) => state.user);
  const hasHydrated = useAuth((state) => state.hasHydrated);
  const warehouseQuery = useWarehouse();
  const warehouseId = warehouseQuery.data?.id;

  useEffect(() => {
    if (hasHydrated && !token) router.replace("/login");
  }, [hasHydrated, token, router]);

  useEffect(() => {
    if (!hasHydrated || !token || !user) return;
    const route = getNavItem(pathname);
    if (!route || roleHasPermission(user.role, route.requiredPermission)) return;
    const fallback = navItems.find((item) => roleHasPermission(user.role, item.requiredPermission));
    router.replace(fallback?.path ?? "/login");
  }, [hasHydrated, pathname, router, token, user]);

  const incidentsQuery = useQuery({
    queryKey: ["open-incidents", warehouseId],
    queryFn: () => getOpenIncidents(warehouseId ?? ""),
    enabled: Boolean(warehouseId),
    refetchInterval: 12_000,
  });

  // Kho đang xem chỉ dùng lúc có thông báo tới, không dùng để mở kết nối. Giữ nó
  // trong ref thay vì trong danh sách phụ thuộc, vì lý do ở khối dưới.
  const warehouseIdRef = useRef(warehouseId);
  useEffect(() => {
    warehouseIdRef.current = warehouseId;
  }, [warehouseId]);

  // Sensor snapshots are read by REST polling in their own pages. Socket.IO
  // remains only for lightweight user notifications.
  //
  // CHỈ phụ thuộc vào token. Trước đây có cả `warehouseId`, mà giá trị đó lúc
  // dựng trang đầu tiên là `undefined` rồi vài trăm mili giây sau mới có — nên
  // effect chạy lại và ngắt kết nối vừa mở, đúng lúc nó còn đang bắt tay. Console
  // in ra "WebSocket is closed before the connection is established", và mỗi lần
  // vào trang lại tốn một kết nối chết yểu. Thông báo vẫn tới nhờ socket mở lại
  // và nhờ lượt hỏi định kỳ, nên không ai để ý là có gì đó sai.
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const boToast = useCallback((id: string) => {
    setToasts((current) => current.filter((item) => item.id !== id));
  }, []);
  const focusMission = useMissionFocus((s) => s.focusMission);
  const moNhiemVu = useCallback(
    (item: ToastItem) => {
      boToast(item.id);
      if (!item.missionId) return;
      focusMission(item.missionId);
      router.push(missionDeepLink(item.missionId));
    },
    [boToast, focusMission, router],
  );

  useEffect(() => {
    if (!token) return;
    const socket: Socket = io(BASE, { transports: ["websocket"], auth: { token } });
    socket.on("notification", (payload?: Partial<ToastItem>) => {
      queryClient.invalidateQueries({ queryKey: ["open-incidents", warehouseIdRef.current] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      // Máy chủ có thể phát sự kiện rỗng (chỉ để báo "có gì đó mới"). Không có
      // tiêu đề thì không dựng thẻ: một thẻ trống còn khó hiểu hơn là không có.
      if (!payload?.id || !payload.title) return;
      setToasts((current) =>
        current.some((item) => item.id === payload.id)
          ? current
          : // Giữ tối đa bốn thẻ. Nhiều hơn thì chồng kín màn hình và che mất
            // đúng phần giao diện người dùng đang cần bấm.
            [
              ...current.slice(-3),
              {
                id: payload.id as string,
                kind: payload.kind ?? "",
                title: payload.title as string,
                body: payload.body ?? "",
                missionId: payload.missionId ?? null,
              },
            ],
      );
    });
    return () => {
      socket.disconnect();
    };
  }, [token, queryClient]);

  useIncidentAlertsBridge(incidentsQuery.data);

  if (!hasHydrated || !token) return null;
  return (
    <DashboardShell warehouseName={warehouseQuery.data?.name}>
      {children}
      {warehouseId ? <FloatingAssistant warehouseId={warehouseId} /> : null}
      <NotificationToasts items={toasts} onOpen={moNhiemVu} onDismiss={boToast} />
    </DashboardShell>
  );
}
