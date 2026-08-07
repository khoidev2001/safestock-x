"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { DashboardPage } from "@/components/dashboard/dashboard-page";
import { LoanStockMarksPanel } from "@/components/dashboard/loan-stock-marks-panel";
import { MissionInbox } from "@/components/mission/mission-inbox";
import { DispatchBlockersBanner } from "@/components/dashboard/dispatch-blockers-banner";
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
import { listMissions, type Mission } from "@/lib/mission-api";
import { useAuth } from "@/lib/auth-store";

export default function ReadinessPage() {
  return (
    <DashboardPage>{(warehouseId) => <ReadinessContent warehouseId={warehouseId} />}</DashboardPage>
  );
}

function ReadinessContent({ warehouseId }: { warehouseId: string }) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const role = useAuth((state) => state.user?.role);

  const treeQuery = useQuery({
    queryKey: ["warehouse-tree", warehouseId],
    queryFn: () => getWarehouseTree(warehouseId),
  });

  const readinessQuery = useQuery({
    queryKey: ["warehouse-readiness", warehouseId],
    queryFn: () => getWarehouseReadiness(warehouseId),
    refetchInterval: 10_000,
  });

  const batchesQuery = useQuery({
    queryKey: ["inventory-batches", warehouseId],
    queryFn: () => getInventoryBatches(warehouseId),
  });

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

  // Nhiệm vụ đưa lên trang này để người trực thấy việc ngay khi mở, không phải
  // nhớ sang tab khác. Chính `MissionInbox` đã tự đẩy việc cần mình lên đầu.
  const missionsQuery = useQuery({
    queryKey: ["missions"],
    queryFn: () => listMissions(),
    refetchInterval: 15_000,
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
      {/*
        THỨ TỰ TRÊN TRANG NÀY LÀ THỨ TỰ ƯU TIÊN, không phải thứ tự tiện tay xếp.
        Người trực mở trang lúc đang có việc, đọc từ trên xuống và dừng lại ở chỗ
        đầu tiên cần làm gì đó. Thứ nào cần hành động sớm hơn thì nằm cao hơn:

          1. Việc đang chặn điều phối  — chặn thì không điều được xe, phải xử ngay
          2. Nhiệm vụ đang chờ mình     — việc cụ thể đã giao, có người đang đợi
          3. Sự cố đang mở              — đã xảy ra, cần theo dõi
          4. Mức sẵn sàng, tồn, kiểm kê — trạng thái, đọc để quyết định
          5. Hàng đang mắc nợ xã khác   — đối chiếu, không gấp
          6. Bản đồ và thiết bị         — tra cứu khi cần

        Đảo thứ tự này là đảo mức độ khẩn, nên đừng chèn khối mới vào giữa mà
        không hỏi nó cần hành động nhanh tới đâu.
      */}
      <DispatchBlockersBanner blockers={readinessQuery.data?.blockers} />

      <MissionInbox
        error={missionsQuery.error as Error | null}
        isLoading={missionsQuery.isLoading}
        missions={(missionsQuery.data as Mission[] | undefined) ?? []}
        onRetry={() => missionsQuery.refetch()}
        onSelect={(missionId) => router.push(`/mission?id=${missionId}`)}
        role={role}
        selectedMissionId={null}
        warehouseId={warehouseId}
      />

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

      {/* Tự ẩn khi không nợ ai — không chiếm chỗ lúc không có gì để đối chiếu. */}
      <LoanStockMarksPanel />

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
