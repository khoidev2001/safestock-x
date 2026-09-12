"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { DashboardPage } from "@/components/dashboard/dashboard-page";
import { MissionInbox } from "@/components/mission/mission-inbox";
import { missionNumberLink } from "@/lib/mission-inbox-state";
import { DispatchBlockersBanner } from "@/components/dashboard/dispatch-blockers-banner";
import { CommuneSupplySummary } from "@/components/dashboard/commune-supply-summary";
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
import { useAuth } from "@/lib/auth-store";
import { useTabTransitionContext } from "@/lib/tab-transition-context";

export default function OverallPage() {
  return (
    <DashboardPage>{(warehouseId) => <OverallContent warehouseId={warehouseId} />}</DashboardPage>
  );
}

function OverallContent({ warehouseId }: { warehouseId: string }) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const transition = useTabTransitionContext();
  const role = useAuth((state) => state.user?.role);

  // Ngoài shell thì không có khối chờ nào — rơi về chuyển trang thường thay vì
  // bỏ hẳn cú bấm.
  const goToTab = (path: string) =>
    transition ? transition.goToTab(path) : router.push(path);

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

          1. Việc đang chặn điều phối    — chặn thì không điều được xe, phải xử ngay
          2. Nhiệm vụ đang chờ mình       — việc cụ thể đã giao, có người đang đợi
          3. Vật tư toàn xã, hạn dùng     — đi được hay không phụ thuộc chỗ này
          4. Lô còn ít, sự cố, mượn — trả — việc phải để mắt trong ca trực
          5. Mức sẵn sàng theo 6 tiêu chí — trạng thái, đọc để quyết định
          6. Bản đồ và thiết bị           — tra cứu khi cần

        Đảo thứ tự này là đảo mức độ khẩn, nên đừng chèn khối mới vào giữa mà
        không hỏi nó cần hành động nhanh tới đâu.
      */}
      <DispatchBlockersBanner blockers={readinessQuery.data?.blockers} />

      <MissionInbox
        // Mở nhiệm vụ qua khối chờ chung, không phải `router.push` trần: thẻ
        // nhiệm vụ là cú bấm hay dùng nhất trên trang này, mà trang chi tiết còn
        // phải gọi mạng lấy nhiệm vụ nên khoảng lặng sau cú bấm dài nhất ở đây.
        onSelect={(missionNo) => goToTab(missionNumberLink(missionNo))}
        // 9 thẻ: vừa đúng ba hàng của lưới ba cột, và giữ cho tồn kho, sự cố,
        // mượn — trả bên dưới còn nằm trong tầm cuộn. Tab Nhiệm vụ giữ mặc định
        // 15 vì ở đó hộp nhiệm vụ là thứ duy nhất trên trang.
        pageSize={9}
        role={role}
        selectedMissionId={null}
        warehouseId={warehouseId}
      />

      {/* Vật tư toàn xã đứng ngay sau hộp nhiệm vụ: đọc xong "phải đi những đâu"
          thì câu kế tiếp luôn là "xã còn đủ hàng không, và thứ gì sắp hỏng cần
          đẩy đi trước". Để nó dưới các khối trạng thái là bắt người trực cuộn
          qua ba màn hình giữa hai câu hỏi dính liền nhau. */}
      <CommuneSupplySummary warehouseId={warehouseId} />

      <OperationsSummary
        batches={batchesQuery.data}
        incidents={incidentsQuery.data}
        readiness={readinessQuery.data}
        warehouseId={warehouseId}
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
          showTimeline={false}
          timeline={timelineQuery.data}
        />
      </div>
    </>
  );
}
