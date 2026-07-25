"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { io, type Socket } from "socket.io-client";
import { BASE } from "@/lib/api";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { FloatingAssistant } from "@/components/assistant/floating-assistant";
import { useIncidentAlertsBridge } from "@/components/assistant/use-incident-alerts";
import { getOpenIncidents } from "@/lib/dashboard-api";
import { useAuth } from "@/lib/auth-store";
import { useWarehouse } from "@/lib/use-warehouse";

/**
 * Layout dùng chung cho toàn bộ trang đã đăng nhập. Trước đây mọi thứ nằm trong
 * một page.tsx khổng lồ; nay khung điều hướng, chốt đăng nhập, cảnh báo realtime
 * và trợ lý nổi sống ở đây, còn nội dung từng route nằm trong page.tsx riêng.
 */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const token = useAuth((state) => state.token);
  const hasHydrated = useAuth((state) => state.hasHydrated);

  const warehouseQuery = useWarehouse();
  const warehouseId = warehouseQuery.data?.id;

  useEffect(() => {
    if (hasHydrated && !token) router.replace("/login");
  }, [hasHydrated, token, router]);

  // Sự cố đang mở — nuôi cầu nối cảnh báo AI cho trợ lý (chạy ở mọi trang).
  const incidentsQuery = useQuery({
    queryKey: ["open-incidents", warehouseId],
    queryFn: () => getOpenIncidents(warehouseId ?? ""),
    enabled: Boolean(warehouseId),
    refetchInterval: 12_000, // fallback nếu WebSocket rớt — bắt kịp AI enrich
  });

  // Realtime room derived from the authenticated user; notifications trigger a refetch.
  useEffect(() => {
    if (!token) return;
    const socket: Socket = io(BASE, {
      transports: ["websocket"],
      auth: { token },
    });
    socket.on("notification", () => {
      queryClient.invalidateQueries({ queryKey: ["open-incidents", warehouseId] });
    });
    return () => {
      socket.disconnect();
    };
  }, [token, warehouseId, queryClient]);

  // Cầu nối: sự cố có explanation (AI) → bong bóng cảnh báo trong trợ lý + tự mở nếu nghiêm trọng.
  useIncidentAlertsBridge(incidentsQuery.data);

  if (!hasHydrated || !token) return null;

  return (
    <DashboardShell warehouseName={warehouseQuery.data?.name}>
      {children}
      {warehouseId ? (
        <FloatingAssistant isHidden={pathname === "/assistant"} warehouseId={warehouseId} />
      ) : null}
    </DashboardShell>
  );
}
