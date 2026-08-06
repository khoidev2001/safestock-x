"use client";

import { useQuery } from "@tanstack/react-query";
import { DashboardPage } from "@/components/dashboard/dashboard-page";
import { SimulatorPanel } from "@/components/dashboard/simulator-panel";
import { WarehouseMap } from "@/components/dashboard/warehouse-map";
import { getDevices, getTimeline, getWarehouseTree } from "@/lib/dashboard-api";

export default function SimulatorPage() {
  return (
    <DashboardPage>{(warehouseId) => <SimulatorContent warehouseId={warehouseId} />}</DashboardPage>
  );
}

function SimulatorContent({ warehouseId }: { warehouseId: string }) {
  const devicesQuery = useQuery({
    queryKey: ["devices", warehouseId],
    queryFn: () => getDevices(warehouseId),
    refetchInterval: 10_000,
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
    /* Xếp theo hàng, mỗi khối chiếm trọn bề ngang.
       Hai cột làm cột trái chỉ rộng 480px, mà ở đó có 14 thẻ cảm biến — nhét vừa
       hai thẻ một hàng nên phải cuộn rất dài, trong khi cột phải thừa chỗ. */
    <div className="grid gap-4">
      <SimulatorPanel
        devices={devicesQuery.data}
        isLoading={devicesQuery.isLoading || timelineQuery.isLoading}
        timeline={timelineQuery.data}
      />
      <WarehouseMap isLoading={treeQuery.isLoading} tree={treeQuery.data} />
    </div>
  );
}
