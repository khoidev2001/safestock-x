"use client";

import { DashboardPage } from "@/components/dashboard/dashboard-page";
import { IncidentView } from "@/components/dashboard/incident-view";

export default function IncidentPage() {
  return (
    <DashboardPage>{(warehouseId) => <IncidentView warehouseId={warehouseId} />}</DashboardPage>
  );
}
