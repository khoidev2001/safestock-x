"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ColorIcon } from "@/components/shared/color-icon";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-store";
import { useMissionFocus } from "@/lib/mission-focus-store";
import { filterMissionInbox, missionDeepLink } from "@/lib/mission-inbox-state";
import type { LatLng } from "@/lib/geo";
import { ApiError } from "@/lib/api";
import {
  cancelMission,
  completeMission,
  confirmMission,
  deferMission,
  dispatchMission,
  generateActionPlan,
  generatePlan,
  getMission,
  listMissions,
  parseIncident,
  planFromReport,
  prepareMission,
  resendMission,
  transcribeAudio,
  type DeliveryOutcome,
  type GenerateInput,
  type Mission,
} from "@/lib/mission-api";
import { blobToWavBase64 } from "@/lib/audio-wav";
import { ActionPlanView } from "./action-plan-view";
import { MissionInbox } from "./mission-inbox";
import { MissionReadinessPanel } from "./mission-readiness-panel";
import { WorkflowStepper } from "./workflow-stepper";

const IncidentMap = dynamic(() => import("./incident-map").then((m) => m.IncidentMap), {
  ssr: false,
  loading: () => <div className="h-[320px] animate-pulse rounded-md border bg-[var(--surface)]" />,
});

/** Tình huống mẫu — bấm nhanh, phòng khi cán bộ chưa quen nhập tay. */
const SAMPLES: { label: string; input: GenerateInput["incident"] }[] = [
  {
    label: "Lũ lụt 100 người",
    input: {
      incidentType: "FLOOD",
      affectedPeople: 100,
      durationHours: 24,
      children: 10,
      elderly: 5,
      medicalSupportCases: 3,
    },
  },
  {
    label: "Bão 50 người",
    input: {
      incidentType: "STORM",
      affectedPeople: 50,
      durationHours: 12,
      children: 5,
      elderly: 3,
      medicalSupportCases: 1,
    },
  },
  {
    label: "Sạt lở 30 người",
    input: {
      incidentType: "LANDSLIDE",
      affectedPeople: 30,
      durationHours: 48,
      children: 3,
      elderly: 2,
      medicalSupportCases: 4,
    },
  },
];

const INCIDENT_TYPES = [
  { value: "FLOOD", label: "Lũ lụt" },
  { value: "STORM", label: "Bão" },
  { value: "LANDSLIDE", label: "Sạt lở" },
  { value: "FIRE", label: "Cháy" },
  { value: "ISOLATION", label: "Cô lập" },
  { value: "OTHER", label: "Khác" },
];

type IncidentForm = GenerateInput["incident"] & {
  children: number;
  elderly: number;
  medicalSupportCases: number;
};

export function MissionView({ warehouseId }: { warehouseId: string }) {
  const role = useAuth((s) => s.user?.role);
  const assignedWarehouseId = useAuth((s) => s.user?.warehouseId);
  const queryClient = useQueryClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const missionId = searchParams.get("mission")?.trim() || null;
  const selectMission = useCallback(
    (id: string, replace = false) => {
      const href = missionDeepLink(id);
      if (replace) {
        router.replace(href, { scroll: false });
      } else {
        router.push(href, { scroll: false });
      }
    },
    [router],
  );
  const [form, setForm] = useState<IncidentForm>({
    incidentType: "FLOOD",
    location: "",
    affectedPeople: 100,
    durationHours: 24,
    children: 0,
    elderly: 0,
    medicalSupportCases: 0,
  });
  const [incidentPoint] = useState<LatLng | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);
  const [workflowError, setWorkflowError] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);

  // Mở đúng nhiệm vụ khi bấm thông báo (chuông) — kể cả mission đã REJECTED/DEFERRED.
  const focusMissionId = useMissionFocus((s) => s.focusMissionId);
  const clearFocus = useMissionFocus((s) => s.clearFocus);
  useEffect(() => {
    if (focusMissionId) {
      if (focusMissionId !== missionId) {
        selectMission(focusMissionId);
      }
      clearFocus();
    }
  }, [focusMissionId, missionId, clearFocus, selectMission]);

  const missionListQuery = useQuery({
    queryKey: ["missions", "inbox", role, assignedWarehouseId],
    queryFn: () => listMissions(),
    enabled: Boolean(role),
    refetchInterval: 5000,
  });

  useEffect(() => {
    if (missionId || !missionListQuery.data?.length) {
      return;
    }

    const activeMission = filterMissionInbox(missionListQuery.data, {
      view: "active",
      search: "",
      role,
      warehouseId: assignedWarehouseId,
    })[0];
    selectMission(activeMission?.id ?? missionListQuery.data[0].id, true);
  }, [
    assignedWarehouseId,
    missionId,
    missionListQuery.data,
    role,
    selectMission,
  ]);

  const missionQuery = useQuery({
    queryKey: ["mission", missionId],
    queryFn: () => getMission(missionId as string),
    enabled: Boolean(missionId),
    refetchInterval: 5000, // Cập nhật trạng thái khi bộ phận khác hoàn tất phần việc.
  });

  const mission = missionQuery.data;
  // Báo cáo của trưởng thôn (mobile): DRAFT chỉ có mô tả thô, chưa phân tích (0 nhu cầu).
  // Admin mở tin này trên web để đọc lại rồi phân tích thành phương án ngay trên chính nó.
  const isReportDraft =
    Boolean(mission?.reportText) &&
    mission?.status === "DRAFT" &&
    mission.requirements.length === 0;

  // Mở một báo cáo chưa phân tích → đổ mô tả thô vào ô nhập để admin xem lại rồi phân tích.
  // Chỉ chạy khi cờ báo cáo/mô tả đổi (không đè chỉnh sửa của admin khi query tự refetch).
  useEffect(() => {
    if (isReportDraft && mission?.reportText) setDescription(mission.reportText);
  }, [isReportDraft, mission?.reportText]);

  // Phân tích BÁO CÁO đang mở ngay trên nó (không tạo mission mới) — dùng lại cho cả
  // đường "mô tả bằng lời" lẫn "nhập tay form", tránh đẻ DRAFT mồ côi bỏ quên báo cáo.
  const analyzeOpenReport = (incident: GenerateInput["incident"]) => {
    const reportPoint =
      mission?.incidentLat != null && mission?.incidentLng != null
        ? { lat: mission.incidentLat, lng: mission.incidentLng }
        : undefined;
    return planFromReport(missionId as string, {
      incident,
      ...(reportPoint
        ? { incidentLat: reportPoint.lat, incidentLng: reportPoint.lng }
        : {}),
    });
  };

  const genPlan = useMutation({
    mutationFn: () => {
      if (missionId && isReportDraft) return analyzeOpenReport(form);
      return generatePlan({
        warehouseId,
        incident: form,
        ...(incidentPoint
          ? { incidentLat: incidentPoint.lat, incidentLng: incidentPoint.lng }
          : {}),
      });
    },
    onSuccess: (m: Mission) => {
      selectMission(m.id);
      setPlanError(null);
      queryClient.invalidateQueries({ queryKey: ["mission", m.id] });
      queryClient.invalidateQueries({ queryKey: ["missions", "inbox"] });
    },
    onError: (err) =>
      setPlanError(
        err instanceof ApiError ? err.message : "Chưa thể lập phương án. Vui lòng thử lại.",
      ),
  });

  // AI phân tích lời kể → tính nhu cầu vật tư + lập phương án NGAY trong một bước.
  // Backend chỉ chấp nhận thôn đã xác minh hoặc tọa độ thật; không sinh điểm giả để lấp dữ liệu.
  const analyze = useMutation({
    mutationFn: async () => {
      const p = await parseIncident(description);
      const incident = {
        incidentType: p.incidentType,
        location: p.location ?? undefined,
        affectedPeople: p.affectedPeople,
        durationHours: p.durationHours,
        children: p.children,
        elderly: p.elderly,
        medicalSupportCases: p.medicalSupportCases,
      };
      setForm(incident); // phản chiếu lên form để cán bộ vẫn xem/sửa lại được sau
      if (missionId && isReportDraft) return analyzeOpenReport(incident);
      return generatePlan({
        warehouseId,
        incident,
        ...(incidentPoint
          ? { incidentLat: incidentPoint.lat, incidentLng: incidentPoint.lng }
          : {}),
      });
    },
    onSuccess: (m: Mission) => {
      selectMission(m.id);
      setParseError(null);
      setPlanError(null);
      queryClient.invalidateQueries({ queryKey: ["mission", m.id] });
      queryClient.invalidateQueries({ queryKey: ["missions", "inbox"] });
    },
    onError: (err) => {
      setParseError(
        err instanceof ApiError
          ? err.message
          : "Chưa phân tích được mô tả. Thử diễn đạt rõ hơn hoặc nhập tay bên dưới.",
      );
    },
  });

  const genActionPlan = useMutation({
    mutationFn: () => generateActionPlan(missionId as string),
    onSuccess: () => {
      setWorkflowError(null);
      queryClient.invalidateQueries({ queryKey: ["missions", "inbox"] });
      return queryClient.invalidateQueries({ queryKey: ["mission", missionId] });
    },
    onError: (err) =>
      setWorkflowError(
        err instanceof ApiError
          ? err.message
          : "Chưa thể lập kế hoạch cứu hộ. Vui lòng kiểm tra địa điểm ứng phó.",
      ),
  });

  const step = useMutation({
    mutationFn: (fn: (id: string) => Promise<Mission>) => fn(missionId as string),
    onSuccess: () => {
      setWorkflowError(null);
      queryClient.invalidateQueries({ queryKey: ["missions", "inbox"] });
      return queryClient.invalidateQueries({ queryKey: ["mission", missionId] });
    },
    onError: (err) =>
      setWorkflowError(
        err instanceof ApiError ? err.message : "Chưa thể cập nhật nhiệm vụ. Vui lòng thử lại.",
      ),
  });

  const isAdmin = role === "ADMIN";
  const effectiveIncidentPoint =
    mission?.incidentLat != null && mission?.incidentLng != null
      ? { lat: mission.incidentLat, lng: mission.incidentLng }
      : incidentPoint;
  const missionHasIncidentPoint =
    mission?.incidentLat != null && mission?.incidentLng != null;
  const reportHasIncidentPoint = isReportDraft && missionHasIncidentPoint;
  const canCalculatePlan = Boolean(
    incidentPoint || form.location?.trim() || reportHasIncidentPoint,
  );

  return (
    <div className="space-y-4">
      <MissionInbox
        missions={missionListQuery.data ?? []}
        selectedMissionId={missionId}
        role={role}
        warehouseId={assignedWarehouseId}
        isLoading={missionListQuery.isPending}
        error={missionListQuery.error}
        onRetry={() => missionListQuery.refetch()}
        onSelect={selectMission}
      />

      <div className="grid gap-4 xl:grid-cols-[380px_1fr]">
      {/* Cột trái: nhập tình huống (chỉ ADMIN lập) */}
      <div className="space-y-4">
        {isAdmin && (
          <section className="app-panel p-5">
            <h2 className="font-semibold">Tình huống khẩn cấp</h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Nhập quy mô ảnh hưởng để hệ thống tính nhu cầu vật tư ban đầu.
            </p>

            <DescribeIncidentBlock
              value={description}
              onChange={setDescription}
              onAnalyze={() => analyze.mutate()}
              analyzing={analyze.isPending}
              error={parseError}
            />

            <div className="mt-4 flex flex-wrap gap-2">
              {SAMPLES.map((s) => (
                <button
                  key={s.label}
                  type="button"
                  onClick={() =>
                    setForm({ children: 0, elderly: 0, medicalSupportCases: 0, ...s.input })
                  }
                  className="rounded-full border bg-[var(--surface-2)] px-3 py-1.5 text-xs font-medium transition hover:bg-[var(--surface)] active:translate-y-px"
                >
                  {s.label}
                </button>
              ))}
            </div>

            <div className="mt-4 space-y-3">
              <Field label="Loại tình huống">
                <select
                  value={form.incidentType}
                  onChange={(e) => setForm({ ...form, incidentType: e.target.value })}
                  className="w-full rounded-md border bg-[var(--surface)] px-3 py-2 text-sm"
                >
                  {INCIDENT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Địa điểm ứng phó">
                <input
                  value={form.location ?? ""}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                  placeholder="Tên thôn đã được ADMIN xác minh"
                  className="w-full rounded-md border bg-[var(--surface)] px-3 py-2 text-sm"
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <NumberField
                  label="Số người"
                  value={form.affectedPeople}
                  onChange={(v) => setForm({ ...form, affectedPeople: v })}
                />
                <NumberField
                  label="Số giờ dự kiến"
                  value={form.durationHours}
                  onChange={(v) => setForm({ ...form, durationHours: v })}
                />
                <NumberField
                  label="Trẻ em"
                  value={form.children}
                  onChange={(v) => setForm({ ...form, children: v })}
                />
                <NumberField
                  label="Người già"
                  value={form.elderly}
                  onChange={(v) => setForm({ ...form, elderly: v })}
                />
                <NumberField
                  label="Ca y tế"
                  value={form.medicalSupportCases}
                  onChange={(v) => setForm({ ...form, medicalSupportCases: v })}
                />
              </div>
            </div>

            <button
              type="button"
              onClick={() => genPlan.mutate()}
              disabled={genPlan.isPending || !canCalculatePlan}
              title={
                canCalculatePlan
                  ? undefined
                  : "Cần nhập thôn đã xác minh trước khi tính nhu cầu"
              }
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-md bg-[var(--color-accent)] px-4 py-2.5 font-semibold text-[var(--color-accent-fg)] transition hover:brightness-95 active:translate-y-px disabled:opacity-60"
            >
              <ColorIcon name="mission" size={19} tone="orange" />
              {genPlan.isPending ? "Đang tính nhu cầu" : "Tính nhu cầu vật tư"}
            </button>
            {!canCalculatePlan && (
              <p className="mt-2 text-xs text-[var(--color-critical)]">
                Cần nhập tên thôn đã được ADMIN xác minh trước khi tính nhu cầu vật tư.
              </p>
            )}
            {planError && <p className="mt-2 text-xs text-[var(--color-critical)]">{planError}</p>}
          </section>
        )}

        {isAdmin && (
          <section className="app-panel p-5">
            <h3 className="text-sm font-semibold">Vị trí sự cố và các kho</h3>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              {mission
                ? missionHasIncidentPoint
                  ? "Vị trí đã được ghi nhận trong phương án."
                  : "Nhiệm vụ chưa có điểm ứng phó. Hãy nhập thôn đã xác minh và tính lại phương án."
                : "Nhập tên thôn đã được ADMIN xác minh để hệ thống xác định điểm ứng phó."}
            </p>
            <div className="mt-3">
              <IncidentMap
                warehouses={mission?.actionPlan?.warehouses ?? []}
                incidentPoint={effectiveIncidentPoint}
              />
            </div>
          </section>
        )}

        {/* Bảng phân bổ nhanh khi đã có mission */}
        {mission && (
          <section className="app-panel p-5">
            <h3 className="text-sm font-semibold">Tóm tắt nhu cầu</h3>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              {INCIDENT_TYPES.find((item) => item.value === mission.incidentType)?.label ??
                mission.incidentType}{" "}
              · {mission.affectedPeople} người · có thể đáp ứng{" "}
              <b
                style={{
                  color: mission.fulfillment >= 70 ? "var(--color-ready)" : "var(--color-critical)",
                }}
              >
                {mission.fulfillment}%
              </b>
            </p>
          </section>
        )}
      </div>

      {/* Cột phải: workflow + Action Plan */}
      <div className="space-y-4">
        {missionId && missionQuery.isPending ? (
          <MissionDetailLoading />
        ) : missionQuery.isError ? (
          <MissionDetailError
            message={
              missionQuery.error instanceof ApiError
                ? missionQuery.error.message
                : "Không mở được nhiệm vụ này. Nhiệm vụ có thể đã bị xóa hoặc bạn không có quyền truy cập."
            }
            onRetry={() => missionQuery.refetch()}
          />
        ) : !mission ? (
          <EmptyState isAdmin={isAdmin} />
        ) : (
          <>
            {isReportDraft && (
              <ReportDraftBanner
                reportText={mission.reportText ?? ""}
                isAdmin={isAdmin}
                onAnalyze={() => analyze.mutate()}
                analyzing={analyze.isPending}
              />
            )}
            {mission.readinessAssessment && (
              <MissionReadinessPanel assessment={mission.readinessAssessment} />
            )}
            <section className="app-panel p-5">
              <WorkflowStepper status={mission.status} />
              <div className="mt-5 border-t pt-4">
                <RoleActions
                  mission={mission}
                  role={role}
                  assignedWarehouseId={assignedWarehouseId}
                  isReportDraft={isReportDraft}
                  hasIncidentPoint={missionHasIncidentPoint}
                  onGenerateActionPlan={() => genActionPlan.mutate()}
                  onDispatch={() => step.mutate(dispatchMission)}
                  onConfirm={() => step.mutate(confirmMission)}
                  onPrepare={() => step.mutate(prepareMission)}
                  onDefer={() => step.mutate(deferMission)}
                  onResend={(note) => step.mutate((id) => resendMission(id, note))}
                  onCancel={(note) => step.mutate((id) => cancelMission(id, note))}
                  onComplete={(outcome, note) =>
                    step.mutate((id) => completeMission(id, outcome, note))
                  }
                  busy={genActionPlan.isPending || step.isPending}
                />
              </div>
              {workflowError && (
                <p className="mt-3 text-sm text-[var(--color-critical)]">{workflowError}</p>
              )}
            </section>

            {mission.actionPlan ? (
              <ActionPlanView plan={mission.actionPlan} incidentPoint={effectiveIncidentPoint} />
            ) : (
              <div className="rounded-md border border-dashed bg-[var(--surface)] p-8 text-center text-sm text-[var(--text-muted)]">
                Chọn <b>Lập kế hoạch cứu hộ</b> để tạo các bước thực hiện chi tiết.
              </div>
            )}
          </>
        )}
      </div>
    </div>
    </div>
  );
}

function MissionDetailLoading() {
  return (
    <div className="app-panel space-y-4 p-5" aria-label="Đang tải chi tiết nhiệm vụ" aria-busy>
      <div className="h-5 w-44 animate-pulse rounded bg-[var(--surface-2)]" />
      <div className="h-16 animate-pulse rounded-md bg-[var(--surface-2)]" />
      <div className="h-36 animate-pulse rounded-md bg-[var(--surface-2)]" />
    </div>
  );
}

function MissionDetailError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div
      role="alert"
      className="app-panel border-[var(--color-critical)]/30 bg-[var(--color-critical)]/5 p-5"
    >
      <h2 className="font-semibold">Không mở được nhiệm vụ</h2>
      <p className="mt-1 text-sm text-[var(--text-muted)]">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 rounded-md border bg-[var(--surface)] px-3 py-2 text-sm font-semibold transition hover:bg-[var(--surface-2)] active:translate-y-px"
      >
        Thử lại
      </button>
    </div>
  );
}

const actionBtn =
  "flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition active:translate-y-px disabled:opacity-60";
const primaryStyle = { background: "var(--color-accent)", color: "var(--color-accent-fg)" };

/** Nút hành động hiện theo role + trạng thái — người dùng chỉ thấy việc của mình. */
function RoleActions({
  mission,
  role,
  assignedWarehouseId,
  isReportDraft,
  hasIncidentPoint,
  onGenerateActionPlan,
  onDispatch,
  onConfirm,
  onPrepare,
  onDefer,
  onResend,
  onCancel,
  onComplete,
  busy,
}: {
  mission: Mission;
  role: string | undefined;
  assignedWarehouseId: string | null | undefined;
  isReportDraft: boolean;
  hasIncidentPoint: boolean;
  onGenerateActionPlan: () => void;
  onDispatch: () => void;
  onConfirm: () => void;
  onPrepare: () => void;
  onDefer: () => void;
  onResend: (note: string) => void;
  onCancel: (note: string) => void;
  onComplete: (outcome: DeliveryOutcome, note: string) => void;
  busy: boolean;
}) {
  const isAdmin = role === "ADMIN";
  const preparations = mission.warehousePreparations ?? [];
  const preparedWarehouseCount = preparations.filter((item) => item.preparedAt).length;
  const assignedPreparation = assignedWarehouseId
    ? preparations.find((item) => item.warehouseId === assignedWarehouseId)
    : undefined;
  const isLegacySourceWarehouse =
    preparations.length === 0 && assignedWarehouseId === mission.warehouseId;
  const warehouseCanPrepare =
    role === "WAREHOUSE" &&
    mission.status === "PENDING_WAREHOUSE" &&
    (Boolean(assignedPreparation && !assignedPreparation.preparedAt) ||
      isLegacySourceWarehouse);
  const warehouseAlreadyPrepared =
    role === "WAREHOUSE" &&
    mission.status === "PENDING_WAREHOUSE" &&
    Boolean(assignedPreparation?.preparedAt);
  const showReason =
    (mission.status === "REJECTED" || mission.status === "DEFERRED") && mission.rejectionReason;
  // Admin huỷ được khi nhiệm vụ đang chạy nhưng kho CHƯA xuất vật tư.
  const adminCanCancelActive =
    isAdmin &&
    ["PENDING_RESCUE", "RESCUE_CONFIRMED", "PENDING_WAREHOUSE"].includes(mission.status) &&
    preparedWarehouseCount === 0;

  return (
    <div className="space-y-4">
      {showReason && (
        <div className="rounded-md border border-[var(--color-critical)]/40 bg-[var(--color-critical)]/5 p-3">
          <p className="text-xs font-semibold text-[var(--color-critical)]">
            Lý do đội cứu hộ từ chối
          </p>
          <p className="mt-1 text-sm">{mission.rejectionReason}</p>
        </div>
      )}

      {mission.status === "COMPLETED" && mission.deliveryOutcome && (
        <DeliveryResultBanner outcome={mission.deliveryOutcome} note={mission.deliveryNote} />
      )}

      {preparations.length > 0 &&
        (mission.status === "PENDING_WAREHOUSE" || mission.status === "READY") && (
          <div className="rounded-md border bg-[var(--surface-2)] p-3">
            <p className="text-sm font-semibold">
              Tiến độ kho: {preparedWarehouseCount}/{preparations.length} đã chuẩn bị
            </p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Nhiệm vụ chỉ sẵn sàng giao khi tất cả kho tham gia đã xuất phần được phân bổ.
            </p>
          </div>
        )}

      <div className="flex flex-wrap gap-2">
        {/* Báo cáo chưa phân tích: hành động nằm ở thẻ báo cáo phía trên, không hiện nút phương án. */}
        {isAdmin && mission.status === "DRAFT" && !isReportDraft && (
          <>
            {!mission.actionPlan && (
              <button
                className={actionBtn}
                style={primaryStyle}
                onClick={onGenerateActionPlan}
                disabled={busy || !hasIncidentPoint}
                title={
                  hasIncidentPoint
                    ? undefined
                    : "Cần xác nhận địa điểm ứng phó trước khi lập kế hoạch"
                }
              >
                <ColorIcon name="mission" size={18} tone="orange" /> Lập kế hoạch cứu hộ
              </button>
            )}
            {mission.actionPlan && (
              <button
                className={actionBtn}
                style={primaryStyle}
                onClick={onDispatch}
                disabled={
                  busy ||
                  !hasIncidentPoint ||
                  mission.readinessAssessment?.status === "NOT_DISPATCHABLE"
                }
                title={
                  !hasIncidentPoint
                    ? "Cần xác nhận địa điểm ứng phó trước khi gửi"
                    : mission.readinessAssessment?.status === "NOT_DISPATCHABLE"
                    ? "Cần xử lý phần vật tư còn thiếu trước khi gửi"
                    : undefined
                }
              >
                <ColorIcon name="send" size={18} tone="blue" /> Gửi cho đội cứu hộ
              </button>
            )}
          </>
        )}

        {isAdmin &&
          mission.status === "DRAFT" &&
          !isReportDraft &&
          !hasIncidentPoint && (
            <p className="w-full text-sm text-[var(--color-critical)]">
              Cần xác nhận địa điểm ứng phó trước khi lập kế hoạch hoặc gửi nhiệm vụ.
            </p>
          )}

        {role === "RESCUE" && mission.status === "PENDING_RESCUE" && (
          <button className={actionBtn} style={primaryStyle} onClick={onConfirm} disabled={busy}>
            Xác nhận nhận nhiệm vụ
          </button>
        )}

        {warehouseCanPrepare && (
          <button className={actionBtn} style={primaryStyle} onClick={onPrepare} disabled={busy}>
            Chuẩn bị và xuất phần của kho này
          </button>
        )}

        {warehouseAlreadyPrepared && (
          <p className="text-sm text-[var(--text-muted)]">
            Kho của bạn đã xuất xong; đang chờ các kho còn lại.
          </p>
        )}

        {role === "WAREHOUSE" &&
          mission.status === "PENDING_WAREHOUSE" &&
          !warehouseCanPrepare &&
          !warehouseAlreadyPrepared && (
            <p className="text-sm text-[var(--text-muted)]">
              Kho của bạn không có phần vật tư được phân bổ trong nhiệm vụ này.
            </p>
          )}

        {/* RESCUE xác nhận đã giao tới hiện trường + kết quả (READY → COMPLETED) */}
        {role === "RESCUE" && mission.status === "READY" && (
          <RescueCompleteActions onComplete={onComplete} busy={busy} />
        )}

        {/* ADMIN huỷ nhiệm vụ khi đang chạy (kho chưa xuất vật tư) */}
        {adminCanCancelActive && <AdminCancelActive onCancel={onCancel} busy={busy} />}

        {/* ADMIN xử lý đơn từ chối: tiếp nhận (tạm hoãn) hoặc huỷ */}
        {isAdmin && mission.status === "REJECTED" && (
          <AdminRejectionActions onDefer={onDefer} onCancel={onCancel} busy={busy} />
        )}

        {/* ADMIN gửi lại nhiệm vụ tạm hoãn (kèm ghi chú) hoặc huỷ */}
        {isAdmin && mission.status === "DEFERRED" && (
          <AdminDeferredActions onResend={onResend} onCancel={onCancel} busy={busy} />
        )}

        {!actionableFor(mission.status, role) && (
          <p className="text-sm text-[var(--text-muted)]">{statusHint(mission.status, role)}</p>
        )}
      </div>
    </div>
  );
}

/** Có nút hành động cho role ở trạng thái này không (để quyết định hiện hint). */
function actionableFor(status: string, role: string | undefined): boolean {
  if (role === "ADMIN")
    return [
      "DRAFT",
      "PENDING_RESCUE",
      "RESCUE_CONFIRMED",
      "PENDING_WAREHOUSE",
      "REJECTED",
      "DEFERRED",
    ].includes(status);
  if (role === "RESCUE") return ["PENDING_RESCUE", "READY"].includes(status);
  if (role === "WAREHOUSE") return status === "PENDING_WAREHOUSE";
  return false;
}

/** REJECTED + ADMIN: tiếp nhận (tạm hoãn) hoặc huỷ (kèm lý do). */
function AdminRejectionActions({
  onDefer,
  onCancel,
  busy,
}: {
  onDefer: () => void;
  onCancel: (note: string) => void;
  busy: boolean;
}) {
  const [cancelling, setCancelling] = useState(false);
  const [note, setNote] = useState("");

  if (cancelling) {
    return (
      <div className="w-full space-y-2">
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder="Lý do huỷ nhiệm vụ (gửi cho đội cứu hộ)"
          className="w-full rounded-md border bg-[var(--surface)] px-3 py-2 text-sm"
        />
        <div className="flex gap-2">
          <button
            className={actionBtn}
            style={{ background: "var(--color-critical)", color: "#fff" }}
            onClick={() => onCancel(note)}
            disabled={busy}
          >
            Xác nhận huỷ
          </button>
          <button
            className={`${actionBtn} border`}
            onClick={() => setCancelling(false)}
            disabled={busy}
          >
            Quay lại
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <button className={actionBtn} style={primaryStyle} onClick={onDefer} disabled={busy}>
        <ColorIcon name="workflow" size={18} tone="blue" /> Tiếp nhận (tạm hoãn)
      </button>
      <button
        className={`${actionBtn} border border-[var(--color-critical)] text-[var(--color-critical)]`}
        onClick={() => setCancelling(true)}
        disabled={busy}
      >
        Huỷ nhiệm vụ
      </button>
    </>
  );
}

/** DEFERRED + ADMIN: ghi chú phản hồi rồi gửi lại, hoặc huỷ. */
function AdminDeferredActions({
  onResend,
  onCancel,
  busy,
}: {
  onResend: (note: string) => void;
  onCancel: (note: string) => void;
  busy: boolean;
}) {
  const [note, setNote] = useState("");
  const [cancelling, setCancelling] = useState(false);

  return (
    <div className="w-full space-y-2">
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        placeholder={
          cancelling
            ? "Lý do huỷ nhiệm vụ"
            : "Ghi chú phản hồi cho đội cứu hộ (vd: đã điều thêm nhân lực/vật tư)"
        }
        className="w-full rounded-md border bg-[var(--surface)] px-3 py-2 text-sm"
      />
      <div className="flex flex-wrap gap-2">
        {cancelling ? (
          <>
            <button
              className={actionBtn}
              style={{ background: "var(--color-critical)", color: "#fff" }}
              onClick={() => onCancel(note)}
              disabled={busy}
            >
              Xác nhận huỷ
            </button>
            <button
              className={`${actionBtn} border`}
              onClick={() => setCancelling(false)}
              disabled={busy}
            >
              Quay lại
            </button>
          </>
        ) : (
          <>
            <button
              className={actionBtn}
              style={primaryStyle}
              onClick={() => onResend(note)}
              disabled={busy}
            >
              <ColorIcon name="send" size={18} tone="blue" /> Gửi lại cho đội cứu hộ
            </button>
            <button
              className={`${actionBtn} border border-[var(--color-critical)] text-[var(--color-critical)]`}
              onClick={() => setCancelling(true)}
              disabled={busy}
            >
              Huỷ nhiệm vụ
            </button>
          </>
        )}
      </div>
    </div>
  );
}

const OUTCOME_META: Record<DeliveryOutcome, { label: string; tone: string }> = {
  DELIVERED: { label: "Đã giao đủ", tone: "var(--color-ready)" },
  PARTIAL: { label: "Giao một phần", tone: "var(--color-attention)" },
  FAILED: { label: "Không giao được", tone: "var(--color-critical)" },
};

/** Băng kết quả giao khi nhiệm vụ đã COMPLETED. */
function DeliveryResultBanner({
  outcome,
  note,
}: {
  outcome: DeliveryOutcome;
  note?: string | null;
}) {
  const meta = OUTCOME_META[outcome];
  return (
    <div className="rounded-md border p-3" style={{ borderColor: meta.tone }}>
      <div className="flex items-center gap-2">
        <ColorIcon name="success" size={18} tone="green" />
        <p className="text-sm font-semibold" style={{ color: meta.tone }}>
          Kết quả giao: {meta.label}
        </p>
      </div>
      {note && <p className="mt-1 text-sm text-[var(--text-muted)]">{note}</p>}
    </div>
  );
}

/** READY + RESCUE: chọn kết quả giao (đủ/một phần/thất bại) + ghi chú → hoàn thành. */
function RescueCompleteActions({
  onComplete,
  busy,
}: {
  onComplete: (outcome: DeliveryOutcome, note: string) => void;
  busy: boolean;
}) {
  const [outcome, setOutcome] = useState<DeliveryOutcome>("DELIVERED");
  const [note, setNote] = useState("");
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button
        className={actionBtn}
        style={primaryStyle}
        onClick={() => setConfirming(true)}
        disabled={busy}
      >
        <ColorIcon name="success" size={18} tone="green" /> Xác nhận đã giao
      </button>
    );
  }

  return (
    <div className="w-full space-y-2">
      <div className="flex flex-wrap gap-2">
        {(Object.keys(OUTCOME_META) as DeliveryOutcome[]).map((o) => (
          <button
            key={o}
            type="button"
            onClick={() => setOutcome(o)}
            className="rounded-full border px-3 py-1.5 text-xs font-medium transition"
            style={
              outcome === o
                ? { borderColor: OUTCOME_META[o].tone, color: OUTCOME_META[o].tone }
                : undefined
            }
          >
            {OUTCOME_META[o].label}
          </button>
        ))}
      </div>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        placeholder="Ghi chú kết quả giao (vd: thiếu 20 áo phao, giao tại điểm tập kết xã)"
        className="w-full rounded-md border bg-[var(--surface)] px-3 py-2 text-sm"
      />
      <div className="flex gap-2">
        <button
          className={actionBtn}
          style={primaryStyle}
          onClick={() => onComplete(outcome, note)}
          disabled={busy}
        >
          Hoàn thành nhiệm vụ
        </button>
        <button
          className={`${actionBtn} border`}
          onClick={() => setConfirming(false)}
          disabled={busy}
        >
          Quay lại
        </button>
      </div>
    </div>
  );
}

/** ADMIN huỷ nhiệm vụ đang chạy (kho chưa xuất) — bấm huỷ rồi nhập lý do xác nhận. */
function AdminCancelActive({
  onCancel,
  busy,
}: {
  onCancel: (note: string) => void;
  busy: boolean;
}) {
  const [cancelling, setCancelling] = useState(false);
  const [note, setNote] = useState("");

  if (!cancelling) {
    return (
      <button
        className={`${actionBtn} border border-[var(--color-critical)] text-[var(--color-critical)]`}
        onClick={() => setCancelling(true)}
        disabled={busy}
      >
        Huỷ nhiệm vụ
      </button>
    );
  }

  return (
    <div className="w-full space-y-2">
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        placeholder="Lý do huỷ nhiệm vụ (gửi cho đội cứu hộ và kho)"
        className="w-full rounded-md border bg-[var(--surface)] px-3 py-2 text-sm"
      />
      <div className="flex gap-2">
        <button
          className={actionBtn}
          style={{ background: "var(--color-critical)", color: "#fff" }}
          onClick={() => onCancel(note)}
          disabled={busy}
        >
          Xác nhận huỷ
        </button>
        <button
          className={`${actionBtn} border`}
          onClick={() => setCancelling(false)}
          disabled={busy}
        >
          Quay lại
        </button>
      </div>
    </div>
  );
}

function statusHint(status: string, role: string | undefined): string {
  if (status === "READY") return "Kho đã chuẩn bị xong và sẵn sàng giao vật tư cho đội cứu hộ.";
  if (status === "PENDING_RESCUE") return "Đang chờ đội cứu hộ xác nhận.";
  if (status === "PENDING_WAREHOUSE") return "Đang chờ kho chuẩn bị vật tư.";
  if (status === "DRAFT" && role !== "ADMIN") return "Bộ phận điều phối đang lập kế hoạch.";
  if (status === "REJECTED") return "Đội cứu hộ đã từ chối. Chờ bộ phận điều phối xử lý.";
  if (status === "DEFERRED")
    return "Nhiệm vụ đang tạm hoãn, chờ bộ phận điều phối cập nhật và gửi lại.";
  if (status === "CANCELLED") return "Nhiệm vụ đã huỷ.";
  if (status === "COMPLETED") return "Nhiệm vụ đã hoàn thành. Xem kết quả giao ở trên.";
  return "Không có hành động cho vai trò của bạn ở bước này.";
}

function EmptyState({ isAdmin }: { isAdmin: boolean }) {
  return (
    <div className="rounded-md border border-dashed bg-[var(--surface)] p-10 text-center">
      <ColorIcon className="mx-auto" name="workflow" size={30} tone="blue" />
      <p className="mt-3 font-medium">Chưa có nhiệm vụ cứu hộ</p>
      <p className="mt-1 text-sm text-[var(--text-muted)]">
        {isAdmin
          ? "Nhập tình huống bên trái để bắt đầu lập phương án."
          : "Chờ cơ quan lập và gửi phương án cứu hộ."}
      </p>
    </div>
  );
}

/**
 * Báo cáo thô của trưởng thôn (gửi từ mobile) — hiển thị nguyên văn để admin đọc lại,
 * kèm nút phân tích. Mô tả đã được đổ sẵn xuống ô nhập bên trái để admin xem/sửa trước
 * khi bấm phân tích; nút ở đây là lối tắt nhanh. RESCUE/WAREHOUSE chỉ xem, không phân tích.
 */
function ReportDraftBanner({
  reportText,
  isAdmin,
  onAnalyze,
  analyzing,
}: {
  reportText: string;
  isAdmin: boolean;
  onAnalyze: () => void;
  analyzing: boolean;
}) {
  return (
    <section className="app-panel border-l-4 border-l-[var(--color-accent)] p-5">
      <div className="flex items-center gap-2">
        <ColorIcon name="mission" size={18} tone="orange" />
        <h3 className="text-sm font-semibold">Báo cáo từ trưởng thôn</h3>
        <span className="rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-xs text-[var(--text-muted)]">
          Chưa phân tích
        </span>
      </div>
      <p className="mt-3 whitespace-pre-wrap rounded-md bg-[var(--surface)] p-3 text-sm">
        {reportText}
      </p>
      {isAdmin ? (
        <>
          <p className="mt-3 text-xs text-[var(--text-muted)]">
            Đã đổ mô tả xuống ô nhập bên trái — xem/sửa lại rồi phân tích thành phương án ngay trên
            báo cáo này (không tạo tin mới).
          </p>
          <button
            type="button"
            onClick={onAnalyze}
            disabled={analyzing}
            className="mt-3 flex items-center justify-center gap-2 rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-[var(--color-accent-fg)] transition hover:brightness-95 active:translate-y-px disabled:opacity-60"
          >
            <ColorIcon name="mission" size={18} tone="orange" />
            {analyzing ? "Đang phân tích" : "Phân tích báo cáo"}
          </button>
        </>
      ) : (
        <p className="mt-3 text-xs text-[var(--text-muted)]">Chờ cơ quan phân tích và lập phương án.</p>
      )}
    </section>
  );
}

/**
 * Nhập tình huống bằng lời → AI phân tích và lập phương án cứu hộ ngay. Nút mic ghi âm
 * rồi PhoWhisper local nhận dạng (offline, giọng Việt). Không hỗ trợ mic → ẩn nút, gõ tay vẫn chạy.
 */
function DescribeIncidentBlock({
  value,
  onChange,
  onAnalyze,
  analyzing,
  error,
}: {
  value: string;
  onChange: (v: string) => void;
  onAnalyze: () => void;
  analyzing: boolean;
  error: string | null;
}) {
  // Ghi thêm vào cuối phần đã có (nối tiếp nhiều lần nói), gọn ghẽ khoảng trắng.
  const { supported, status, voiceError, toggle } = useAudioRecorder((text) =>
    onChange([value.trim(), text.trim()].filter(Boolean).join(" ")),
  );
  const recording = status === "recording";
  const transcribing = status === "transcribing";

  return (
    <div className="mt-4 rounded-md border border-dashed bg-[var(--surface-2)] p-3">
      <div className="flex items-center gap-2">
        <ColorIcon name="magic" size={16} tone="amber" />
        <span className="text-xs font-semibold">
          Mô tả tình huống bằng lời — AI phân tích &amp; lập phương án ngay
        </span>
      </div>
      <div className="relative mt-2">
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          placeholder='Vd: "Lũ quét xã Đồng Xuân, khoảng 200 người mắc kẹt, nhiều trẻ em, 3 ngày chưa có nước sạch"'
          className="w-full rounded-md border bg-[var(--surface)] px-3 py-2 pr-10 text-sm"
        />
        {supported && (
          <button
            type="button"
            onClick={toggle}
            disabled={transcribing}
            title={recording ? "Dừng và nhận dạng" : "Nói để nhập (tiếng Việt, offline)"}
            aria-label={recording ? "Dừng ghi âm" : "Nhập bằng giọng nói"}
            className="absolute right-2 top-2 rounded-full border p-1.5 transition active:translate-y-px disabled:opacity-60"
            style={
              recording
                ? {
                    borderColor: "var(--color-critical)",
                    background: "color-mix(in oklch, var(--color-critical) 12%, transparent)",
                  }
                : undefined
            }
          >
            <ColorIcon name="microphone" size={16} tone={recording ? "red" : "blue"} />
          </button>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onAnalyze}
          disabled={analyzing || value.trim().length < 5}
          className="inline-flex items-center gap-2 rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-xs font-semibold text-[var(--color-accent-fg)] transition hover:brightness-95 active:translate-y-px disabled:opacity-60"
        >
          <ColorIcon name="magic" size={15} tone="amber" />
          {analyzing ? "Đang phân tích & lập phương án…" : "Phân tích bằng AI"}
        </button>
        {recording && (
          <span className="text-xs text-[var(--color-critical)]">
            ● Đang ghi âm… bấm mic để dừng
          </span>
        )}
        {transcribing && (
          <span className="text-xs text-[var(--text-muted)]">Đang nhận dạng giọng nói…</span>
        )}
      </div>
      {voiceError && <p className="mt-1.5 text-xs text-[var(--color-attention)]">{voiceError}</p>}
      {error && <p className="mt-1.5 text-xs text-[var(--color-critical)]">{error}</p>}
    </div>
  );
}

type RecorderStatus = "idle" | "recording" | "transcribing";

/**
 * Ghi âm mic → WAV 16kHz → PhoWhisper local (offline) trả text tiếng Việt.
 * Trả {supported, status, voiceError, toggle}. Thiếu getUserMedia/AudioContext → supported=false.
 * Lỗi micro/nhận dạng (vd ai-service tắt, 503) → voiceError, KHÔNG chặn luồng gõ tay.
 */
function useAudioRecorder(onText: (text: string) => void) {
  const [supported, setSupported] = useState(false);
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setSupported(
      Boolean(navigator.mediaDevices?.getUserMedia) &&
        typeof MediaRecorder !== "undefined" &&
        Boolean(
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext,
        ),
    );
    return () => {
      recorderRef.current?.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const startRecording = async () => {
    setVoiceError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        stopStream();
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        if (blob.size === 0) {
          setStatus("idle");
          return;
        }
        setStatus("transcribing");
        try {
          const base64 = await blobToWavBase64(blob);
          const { text } = await transcribeAudio(base64);
          if (text.trim()) onText(text);
          else setVoiceError("Chưa nghe rõ nội dung. Vui lòng nói lại hoặc gõ tay.");
        } catch (err) {
          setVoiceError(
            err instanceof ApiError
              ? "Nhận dạng giọng nói chưa sẵn sàng — vui lòng gõ tay."
              : "Không xử lý được âm thanh. Vui lòng gõ tay.",
          );
        } finally {
          setStatus("idle");
        }
      };
      recorder.start();
      recorderRef.current = recorder;
      setStatus("recording");
    } catch {
      stopStream();
      setStatus("idle");
      setVoiceError("Không truy cập được micro. Kiểm tra quyền trình duyệt hoặc gõ tay.");
    }
  };

  const toggle = () => {
    if (status === "recording") {
      recorderRef.current?.stop();
      recorderRef.current = null;
      return;
    }
    if (status === "idle") void startRecording();
  };

  return { supported, status, voiceError, toggle };
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-[var(--text-muted)]">{label}</span>
      {children}
    </label>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <Field label={label}>
      <input
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value)))}
        className="tabular w-full rounded-md border bg-[var(--surface)] px-3 py-2 text-sm"
      />
    </Field>
  );
}
