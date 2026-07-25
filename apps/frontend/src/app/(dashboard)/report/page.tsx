"use client";

import { DashboardPage } from "@/components/dashboard/dashboard-page";
import { ReportView } from "@/components/dashboard/report-view";

export default function ReportPage() {
  return <DashboardPage>{(warehouseId) => <ReportView warehouseId={warehouseId} />}</DashboardPage>;
}
