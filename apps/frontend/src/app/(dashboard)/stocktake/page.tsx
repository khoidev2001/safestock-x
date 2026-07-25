"use client";

import { DashboardPage } from "@/components/dashboard/dashboard-page";
import { StocktakeView } from "@/components/dashboard/stocktake-view";

export default function StocktakePage() {
  return (
    <DashboardPage>{(warehouseId) => <StocktakeView warehouseId={warehouseId} />}</DashboardPage>
  );
}
