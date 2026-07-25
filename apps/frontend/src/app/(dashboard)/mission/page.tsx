"use client";

import { DashboardPage } from "@/components/dashboard/dashboard-page";
import { MissionView } from "@/components/mission/mission-view";

export default function MissionPage() {
  return <DashboardPage>{(warehouseId) => <MissionView warehouseId={warehouseId} />}</DashboardPage>;
}
