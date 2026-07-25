"use client";

import { DashboardPage } from "@/components/dashboard/dashboard-page";
import { MapView } from "@/components/dashboard/map-view";

export default function MapPage() {
  return <DashboardPage>{(warehouseId) => <MapView warehouseId={warehouseId} />}</DashboardPage>;
}
