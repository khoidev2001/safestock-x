"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DashboardPage } from "@/components/dashboard/dashboard-page";
import { OperationsSummary } from "@/components/dashboard/operations-summary";
import { ReadinessOverview } from "@/components/dashboard/readiness-overview";
import { SimulatorPanel } from "@/components/dashboard/simulator-panel";
import { WarehouseMap } from "@/components/dashboard/warehouse-map";
import { apiFetch } from "@/lib/api";
import {
  getDevices,
  getInventoryBatches,
  getOpenIncidents,
  getTimeline,
  getWarehouseReadiness,
  getWarehouseTree,
} from "@/lib/dashboard-api";

export default function ReadinessPage() {
  return <DashboardPage>{(warehouseId) => <ReadinessContent warehouseId={warehouseId} />}</DashboardPage>;
}

function ReadinessContent({ warehouseId }: { warehouseId: string }) {
  const queryClient = useQueryClient();

  const treeQuery = useQuery({
    queryKey: ["warehouse-tree", warehouseId],
    queryFn: () => getWarehouseTree(warehouseId),
  });

  const readinessQuery = useQuery({
    queryKey: ["warehouse-readiness", warehouseId],
    queryFn: () => getWarehouseReadiness(warehouseId),
  });

  const batchesQuery = useQuery({
    queryKey: ["inventory-batches", warehouseId],
    queryFn: () => getInventoryBatches(warehouseId),
  });

  const devicesQuery = useQuery({
    queryKey: ["devices", warehouseId],
    queryFn: () => getDevices(warehouseId),
  });

  const timelineQuery = useQuery({
    queryKey: ["timeline", warehouseId],
    queryFn: () => getTimeline(warehouseId),
    refetchInterval: 10_000,
  });

  const incidentsQuery = useQuery({
    queryKey: ["open-incidents", warehouseId],
    queryFn: () => getOpenIncidents(warehouseId),
    refetchInterval: 12_000,
  });

  const recalculateMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/api/readiness/warehouses/${warehouseId}/recalculate`, { method: "POST" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["warehouse-readiness", warehouseId] });
    },
  });

  return (
    <>
      <OperationsSummary
        batches={batchesQuery.data}
        incidents={incidentsQuery.data}
        readiness={readinessQuery.data}
      />
      <ReadinessOverview
        isError={readinessQuery.isError || recalculateMutation.isError}
        isLoading={readinessQuery.isLoading}
        isRefreshing={recalculateMutation.isPending || readinessQuery.isFetching}
        onRefresh={() => recalculateMutation.mutate()}
        readiness={readinessQuery.data}
      />
      <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
        <WarehouseMap isLoading={treeQuery.isLoading} tree={treeQuery.data} />
        <SimulatorPanel
          devices={devicesQuery.data}
          isLoading={devicesQuery.isLoading || timelineQuery.isLoading}
          timeline={timelineQuery.data}
        />
      </div>
    </>
  );
}
