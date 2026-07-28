"use client";

import { DashboardPage } from "@/components/dashboard/dashboard-page";
import { InventoryWorkspace } from "@/components/dashboard/inventory-workspace";

export default function InventoryPage() {
  return (
    <DashboardPage>
      {(warehouseId) => <InventoryWorkspace warehouseId={warehouseId} />}
    </DashboardPage>
  );
}
