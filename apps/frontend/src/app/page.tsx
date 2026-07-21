"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ColorIcon } from "@/components/shared/color-icon";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { DashboardShell, type DashboardView } from "@/components/dashboard/dashboard-shell";
import { FloatingAssistant } from "@/components/assistant/floating-assistant";
import { InventoryTable } from "@/components/dashboard/inventory-table";
import { AuditView } from "@/components/dashboard/audit-view";
import { IncidentView } from "@/components/dashboard/incident-view";
import { InsightsView } from "@/components/dashboard/insights-view";
import { AssistantView } from "@/components/dashboard/assistant-view";
import { ReportView } from "@/components/dashboard/report-view";
import { AdminUsersView } from "@/components/dashboard/admin-users-view";
import { MapView } from "@/components/dashboard/map-view";
import { LoanView } from "@/components/dashboard/loan-view";
import { StocktakeView } from "@/components/dashboard/stocktake-view";
import { MissionView } from "@/components/mission/mission-view";
import { OperationsSummary } from "@/components/dashboard/operations-summary";
import { ReadinessOverview } from "@/components/dashboard/readiness-overview";
import { SimulatorPanel } from "@/components/dashboard/simulator-panel";
import { WarehouseMap } from "@/components/dashboard/warehouse-map";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth-store";
import {
  getDevices,
  getFirstWarehouse,
  getInventoryBatches,
  getOpenIncidents,
  getTimeline,
  getWarehouseReadiness,
  getWarehouseTree,
} from "@/lib/dashboard-api";

const viewCopy: Record<DashboardView, { title: string; subtitle: string }> = {
  readiness: {
    title: "Tình trạng sẵn sàng",
    subtitle: "Theo dõi khả năng vận hành, các vướng mắc và việc cần xử lý.",
  },
  insights: {
    title: "Theo dõi và dự báo",
    subtitle: "Nhận biết sớm nguy cơ thiếu hàng, hết hạn và nhu cầu điều chuyển giữa các kho.",
  },
  assistant: {
    title: "Tra cứu kho",
    subtitle: "Hỏi nhanh về số lượng, hạn dùng, sự cố và khả năng đáp ứng hiện tại.",
  },
  map: {
    title: "Bản đồ kho trong xã",
    subtitle: "Theo dõi vị trí kho xã, kho thôn và cập nhật tọa độ khi cần.",
  },
  report: {
    title: "Báo cáo kiểm kê tháng",
    subtitle: "Tiếp nhận báo cáo từ các thôn, kiểm tra và cập nhật số liệu tồn kho.",
  },
  users: {
    title: "Quản lý tài khoản",
    subtitle: "Cấp quyền sử dụng cho phụ trách kho, đội cứu hộ và quản trị xã.",
  },
  mission: {
    title: "Điều phối cứu hộ",
    subtitle: "Ghi nhận tình huống, xác định nhu cầu và phối hợp cấp phát vật tư.",
  },
  inventory: {
    title: "Kho vật tư",
    subtitle: "Tra cứu từng lô hàng, vị trí lưu trữ và số lượng hiện có.",
  },
  simulator: {
    title: "Cảm biến thử nghiệm",
    subtitle: "Theo dõi dữ liệu mô phỏng trước khi kết nối thiết bị thực tế.",
  },
  incident: {
    title: "Sự cố kho",
    subtitle: "Ghi nhận và xử lý các vấn đề ảnh hưởng đến vật tư hoặc hoạt động của kho.",
  },
  stocktake: {
    title: "Kiểm kê",
    subtitle: "Đối chiếu số đếm thực tế với số liệu đang được ghi nhận.",
  },
  loan: {
    title: "Mượn, trả vật tư",
    subtitle: "Theo dõi vật tư đã cho mượn và ghi nhận số lượng được hoàn trả.",
  },
  audit: {
    title: "Nhật ký hoạt động",
    subtitle: "Tra cứu những thay đổi quan trọng đã thực hiện trên hệ thống.",
  },
};

export default function HomePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const token = useAuth((state) => state.token);
  const hasHydrated = useAuth((state) => state.hasHydrated);
  const [activeView, setActiveView] = useState<DashboardView>("readiness");

  useEffect(() => {
    if (hasHydrated && !token) router.replace("/login");
  }, [hasHydrated, token, router]);

  const warehouseQuery = useQuery({
    queryKey: ["first-warehouse"],
    queryFn: getFirstWarehouse,
    enabled: hasHydrated && Boolean(token),
  });

  const warehouseId = warehouseQuery.data?.id;

  const treeQuery = useQuery({
    queryKey: ["warehouse-tree", warehouseId],
    queryFn: () => getWarehouseTree(warehouseId ?? ""),
    enabled: Boolean(warehouseId),
  });

  const readinessQuery = useQuery({
    queryKey: ["warehouse-readiness", warehouseId],
    queryFn: () => getWarehouseReadiness(warehouseId ?? ""),
    enabled: Boolean(warehouseId),
  });

  const batchesQuery = useQuery({
    queryKey: ["inventory-batches", warehouseId],
    queryFn: () => getInventoryBatches(warehouseId ?? ""),
    enabled: Boolean(warehouseId),
  });

  const devicesQuery = useQuery({
    queryKey: ["devices", warehouseId],
    queryFn: () => getDevices(warehouseId ?? ""),
    enabled: Boolean(warehouseId),
  });

  const timelineQuery = useQuery({
    queryKey: ["timeline", warehouseId],
    queryFn: () => getTimeline(warehouseId ?? ""),
    enabled: Boolean(warehouseId),
    refetchInterval: 10_000,
  });

  const incidentsQuery = useQuery({
    queryKey: ["open-incidents", warehouseId],
    queryFn: () => getOpenIncidents(warehouseId ?? ""),
    enabled: Boolean(warehouseId),
  });

  const recalculateMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/api/readiness/warehouses/${warehouseId}/recalculate`, { method: "POST" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["warehouse-readiness", warehouseId] });
    },
  });

  if (!hasHydrated || !token) return null;

  return (
    <DashboardShell activeView={activeView} onViewChange={setActiveView}>
      <div className="space-y-5">
        <PageHeading
          subtitle={viewCopy[activeView].subtitle}
          title={viewCopy[activeView].title}
          warehouseName={warehouseQuery.data?.name ?? "Đang tải kho"}
        />

        {warehouseQuery.isError ? (
          <WarehouseError />
        ) : (
          <>
            {activeView === "readiness" && (
              <OperationsSummary
                batches={batchesQuery.data}
                incidents={incidentsQuery.data}
                readiness={readinessQuery.data}
              />
            )}
            {activeView === "readiness" ? (
              <ReadinessView
                isRefreshing={recalculateMutation.isPending || readinessQuery.isFetching}
                isReadinessError={readinessQuery.isError || recalculateMutation.isError}
                isReadinessLoading={readinessQuery.isLoading}
                isTimelineLoading={devicesQuery.isLoading || timelineQuery.isLoading}
                onRefresh={() => recalculateMutation.mutate()}
                readiness={readinessQuery.data}
                timeline={timelineQuery.data}
                devices={devicesQuery.data}
                tree={treeQuery.data}
                isTreeLoading={treeQuery.isLoading}
              />
            ) : null}
            {activeView === "insights" && warehouseId ? (
              <InsightsView warehouseId={warehouseId} />
            ) : null}
            {activeView === "assistant" && warehouseId ? (
              <AssistantView warehouseId={warehouseId} />
            ) : null}
            {activeView === "mission" && warehouseId ? (
              <MissionView warehouseId={warehouseId} />
            ) : null}
            {activeView === "inventory" ? (
              <InventoryView
                batches={batchesQuery.data}
                isBatchesLoading={batchesQuery.isLoading}
                isTreeLoading={treeQuery.isLoading}
                tree={treeQuery.data}
              />
            ) : null}
            {activeView === "simulator" ? (
              <SimulatorView
                devices={devicesQuery.data}
                isLoading={devicesQuery.isLoading || timelineQuery.isLoading}
                timeline={timelineQuery.data}
                tree={treeQuery.data}
                isTreeLoading={treeQuery.isLoading}
              />
            ) : null}
            {activeView === "incident" && warehouseId ? (
              <IncidentView warehouseId={warehouseId} />
            ) : null}
            {activeView === "stocktake" && warehouseId ? (
              <StocktakeView warehouseId={warehouseId} />
            ) : null}
            {activeView === "loan" && warehouseId ? (
              <LoanView warehouseId={warehouseId} />
            ) : null}
            {activeView === "map" && warehouseId ? (
              <MapView warehouseId={warehouseId} />
            ) : null}
            {activeView === "report" && warehouseId ? (
              <ReportView warehouseId={warehouseId} />
            ) : null}
            {activeView === "users" && warehouseId ? (
              <AdminUsersView warehouseId={warehouseId} />
            ) : null}
            {activeView === "audit" ? <AuditView /> : null}
          </>
        )}

        {warehouseId ? (
          <FloatingAssistant isHidden={activeView === "assistant"} warehouseId={warehouseId} />
        ) : null}
      </div>
    </DashboardShell>
  );
}

function PageHeading({
  subtitle,
  title,
  warehouseName,
}: {
  subtitle: string;
  title: string;
  warehouseName: string;
}) {
  return (
    <div className="border-b pb-5">
      <div>
        <p className="mb-1.5 text-sm font-semibold text-[var(--color-accent)]">{warehouseName}</p>
        <h1 className="text-2xl font-semibold md:text-3xl">{title}</h1>
        <p className="mt-2 max-w-3xl text-base text-[var(--text-muted)]">{subtitle}</p>
      </div>
    </div>
  );
}

function WarehouseError() {
  return (
    <section className="rounded-md border bg-[var(--surface)] p-5">
      <div className="flex items-center gap-2 text-sm font-semibold text-[var(--color-critical)]">
        <ColorIcon name="warning" size={20} tone="red" />
        Không tải được dữ liệu kho
      </div>
      <p className="mt-2 text-sm text-[var(--text-muted)]">
        Kết nối đến hệ thống dữ liệu đang gián đoạn. Vui lòng thử tải lại sau.
      </p>
    </section>
  );
}

function ReadinessView({
  devices,
  isReadinessError,
  isReadinessLoading,
  isRefreshing,
  isTimelineLoading,
  isTreeLoading,
  onRefresh,
  readiness,
  timeline,
  tree,
}: {
  devices: Parameters<typeof SimulatorPanel>[0]["devices"];
  isReadinessError: boolean;
  isReadinessLoading: boolean;
  isRefreshing: boolean;
  isTimelineLoading: boolean;
  isTreeLoading: boolean;
  onRefresh: () => void;
  readiness: Parameters<typeof ReadinessOverview>[0]["readiness"];
  timeline: Parameters<typeof SimulatorPanel>[0]["timeline"];
  tree: Parameters<typeof WarehouseMap>[0]["tree"];
}) {
  return (
    <>
      <ReadinessOverview
        isError={isReadinessError}
        isLoading={isReadinessLoading}
        isRefreshing={isRefreshing}
        onRefresh={onRefresh}
        readiness={readiness}
      />
      <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
        <WarehouseMap isLoading={isTreeLoading} tree={tree} />
        <SimulatorPanel devices={devices} isLoading={isTimelineLoading} timeline={timeline} />
      </div>
    </>
  );
}

function InventoryView({
  batches,
  isBatchesLoading,
  isTreeLoading,
  tree,
}: {
  batches: Parameters<typeof InventoryTable>[0]["batches"];
  isBatchesLoading: boolean;
  isTreeLoading: boolean;
  tree: Parameters<typeof WarehouseMap>[0]["tree"];
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
      <InventoryTable batches={batches} isLoading={isBatchesLoading} />
      <WarehouseMap isLoading={isTreeLoading} tree={tree} />
    </div>
  );
}

function SimulatorView({
  devices,
  isLoading,
  isTreeLoading,
  timeline,
  tree,
}: {
  devices: Parameters<typeof SimulatorPanel>[0]["devices"];
  isLoading: boolean;
  isTreeLoading: boolean;
  timeline: Parameters<typeof SimulatorPanel>[0]["timeline"];
  tree: Parameters<typeof WarehouseMap>[0]["tree"];
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-[480px_1fr]">
      <SimulatorPanel devices={devices} isLoading={isLoading} timeline={timeline} />
      <WarehouseMap isLoading={isTreeLoading} tree={tree} />
    </div>
  );
}
