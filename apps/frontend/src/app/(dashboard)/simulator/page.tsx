"use client";

import { useQuery } from "@tanstack/react-query";
import { DashboardPage } from "@/components/dashboard/dashboard-page";
import { SimulatorPanel } from "@/components/dashboard/simulator-panel";
import { WarehouseMap } from "@/components/dashboard/warehouse-map";
import { getDevices, getTimeline, getWarehouseTree } from "@/lib/dashboard-api";

export default function SimulatorPage() {
  return <DashboardPage>{(warehouseId) => <SimulatorContent warehouseId={warehouseId} />}</DashboardPage>;
}

function SimulatorContent({ warehouseId }: { warehouseId: string }) {
  const devicesQuery = useQuery({
    queryKey: ["devices", warehouseId],
    queryFn: () => getDevices(warehouseId),
  });

  const timelineQuery = useQuery({
    queryKey: ["timeline", warehouseId],
    queryFn: () => getTimeline(warehouseId),
    refetchInterval: 10_000,
  });

  const treeQuery = useQuery({
    queryKey: ["warehouse-tree", warehouseId],
    queryFn: () => getWarehouseTree(warehouseId),
  });

  return (
    <div className="grid gap-4 xl:grid-cols-[480px_1fr]">
      <SimulatorPanel
        devices={devicesQuery.data}
        isLoading={devicesQuery.isLoading || timelineQuery.isLoading}
        timeline={timelineQuery.data}
      />
      <WarehouseMap isLoading={treeQuery.isLoading} tree={treeQuery.data} />
    </div>
  );
}
