"use client";

import { DashboardPage } from "@/components/dashboard/dashboard-page";
import { AssistantView } from "@/components/dashboard/assistant-view";

export default function AssistantPage() {
  return (
    <DashboardPage>{(warehouseId) => <AssistantView warehouseId={warehouseId} />}</DashboardPage>
  );
}
