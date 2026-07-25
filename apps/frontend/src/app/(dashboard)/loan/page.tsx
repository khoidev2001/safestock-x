"use client";

import { DashboardPage } from "@/components/dashboard/dashboard-page";
import { LoanView } from "@/components/dashboard/loan-view";

export default function LoanPage() {
  return <DashboardPage>{(warehouseId) => <LoanView warehouseId={warehouseId} />}</DashboardPage>;
}
