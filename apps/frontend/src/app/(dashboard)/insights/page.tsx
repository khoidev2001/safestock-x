"use client";

import { DashboardPage } from "@/components/dashboard/dashboard-page";
import { InsightsView } from "@/components/dashboard/insights-view";

export default function InsightsPage() {
  return <DashboardPage>{(warehouseId) => <InsightsView warehouseId={warehouseId} />}</DashboardPage>;
}
