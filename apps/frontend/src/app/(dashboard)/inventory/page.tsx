"use client";

import { useQuery } from "@tanstack/react-query";
import { DashboardPage } from "@/components/dashboard/dashboard-page";
import { InventoryTable } from "@/components/dashboard/inventory-table";
import { WarehouseMap } from "@/components/dashboard/warehouse-map";
import { getInventoryBatches, getWarehouseTree } from "@/lib/dashboard-api";

export default function InventoryPage() {
  return <DashboardPage>{(warehouseId) => <InventoryContent warehouseId={warehouseId} />}</DashboardPage>;
}

function InventoryContent({ warehouseId }: { warehouseId: string }) {
  const batchesQuery = useQuery({
    queryKey: ["inventory-batches", warehouseId],
    queryFn: () => getInventoryBatches(warehouseId),
  });

  const treeQuery = useQuery({
    queryKey: ["warehouse-tree", warehouseId],
    queryFn: () => getWarehouseTree(warehouseId),
  });

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
      <InventoryTable batches={batchesQuery.data} isLoading={batchesQuery.isLoading} />
      <WarehouseMap isLoading={treeQuery.isLoading} tree={treeQuery.data} />
    </div>
  );
}
