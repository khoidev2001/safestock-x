"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
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
    title: "Readiness và vận hành kho",
    subtitle: "Điểm sẵn sàng, điểm nghẽn và trạng thái tổng quan.",
  },
  insights: {
    title: "AI quản trị kho ngày thường",
    subtitle: "Dự báo cạn kho, cảnh báo hết hạn, điều chuyển cân bằng, thời tiết và báo cáo tháng.",
  },
  assistant: {
    title: "Trợ lý hỏi-đáp kho",
    subtitle: "Hỏi nhanh về tồn kho, hạn dùng, sự cố — AI trả lời từ dữ liệu kho hiện tại.",
  },
  map: {
    title: "Bản đồ kho trong xã",
    subtitle: "Vị trí kho tổng + kho thôn trên nền bản đồ, ranh giới xã. Quản trị ghim toạ độ.",
  },
  report: {
    title: "Báo cáo kiểm kê tháng",
    subtitle: "Trưởng thôn gửi báo cáo Excel cuối tháng; cơ quan xã duyệt để cập nhật tồn kho.",
  },
  users: {
    title: "Quản lý người dùng",
    subtitle: "Cấp tài khoản trưởng thôn (gán kho), đội cứu hộ, quản trị xã.",
  },
  mission: {
    title: "Điều phối cứu hộ",
    subtitle: "Lập phương án AI, điều phối kho gần nạn nhân và workflow liên vai trò.",
  },
  inventory: {
    title: "Kho vật tư",
    subtitle: "Danh sách lô, vị trí kệ và tình trạng vật tư hiện có.",
  },
  simulator: {
    title: "Mô phỏng cảm biến",
    subtitle: "Thiết bị ảo, timeline event và dữ liệu thay thế IoT.",
  },
  incident: {
    title: "Sự cố kho",
    subtitle: "Phát hiện thất thoát, lỗi cảm biến, bảo quản kém và xử lý.",
  },
  stocktake: {
    title: "Kiểm kê",
    subtitle: "Đối chiếu số đếm thực tế với hệ thống, ghi đè có audit.",
  },
  loan: {
    title: "Mượn - trả",
    subtitle: "Phiếu mượn vật tư tái sử dụng đang mở và ghi nhận hoàn.",
  },
  audit: {
    title: "Hậu kiểm",
    subtitle: "Nhật ký thao tác quan trọng, tra soát theo đối tượng.",
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
      <div className="space-y-4">
        <PageHeading
          apiUrl={process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3100"}
          subtitle={viewCopy[activeView].subtitle}
          title={viewCopy[activeView].title}
          warehouseName={warehouseQuery.data?.name ?? "Đang tải kho"}
        />

        {warehouseQuery.isError ? (
          <WarehouseError />
        ) : (
          <>
            {activeView !== "map" && (
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
  apiUrl,
  subtitle,
  title,
  warehouseName,
}: {
  apiUrl: string;
  subtitle: string;
  title: string;
  warehouseName: string;
}) {
  return (
    <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
      <div>
        <p className="text-sm font-medium text-[var(--text-muted)]">{warehouseName}</p>
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{title}</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">{subtitle}</p>
      </div>
      <div className="rounded-md border bg-[var(--surface)] px-3 py-2 text-xs text-[var(--text-muted)]">
        API: {apiUrl}
      </div>
    </div>
  );
}

function WarehouseError() {
  return (
    <section className="rounded-md border bg-[var(--surface)] p-5">
      <div className="flex items-center gap-2 text-sm font-semibold text-[var(--color-critical)]">
        <AlertTriangle aria-hidden="true" size={18} strokeWidth={1.8} />
        Không tải được kho đầu tiên
      </div>
      <p className="mt-2 text-sm text-[var(--text-muted)]">
        Kiểm tra backend, token đăng nhập hoặc seed dữ liệu mẫu.
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
