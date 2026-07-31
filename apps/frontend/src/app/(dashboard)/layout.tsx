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

  // Sensor snapshots are read by REST polling in their own pages. Socket.IO
  // remains only for lightweight user notifications.
  useEffect(() => {
    if (!token) return;
    const socket: Socket = io(BASE, { transports: ["websocket"], auth: { token } });
    socket.on("notification", () => {
      queryClient.invalidateQueries({ queryKey: ["open-incidents", warehouseId] });
    });
    return () => {
      socket.disconnect();
    };
  }, [token, warehouseId, queryClient]);

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
