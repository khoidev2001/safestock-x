"use client";

import { DashboardPage } from "@/components/dashboard/dashboard-page";
import { MissionView } from "@/components/mission/mission-view";
import { WarehouseRequestInbox } from "@/components/mission/warehouse-request-inbox";
import { useAuth } from "@/lib/auth-store";

export default function MissionPage() {
  const role = useAuth((state) => state.user?.role);
  return (
    <DashboardPage standalone={role === "RESCUE"}>
      {(warehouseId) =>
        role === "WAREHOUSE" ? <WarehouseRequestInbox /> : <MissionView warehouseId={warehouseId} />
      }
    </DashboardPage>
  );
}
