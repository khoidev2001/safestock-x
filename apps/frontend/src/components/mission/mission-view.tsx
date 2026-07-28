"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ColorIcon } from "@/components/shared/color-icon";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-store";
import { useMissionFocus } from "@/lib/mission-focus-store";
import type { LatLng } from "@/lib/geo";
import { ApiError } from "@/lib/api";
import {
  analyzeOperatorReport,
  approveOperatorReport,
  generatePlan,
  getClusterWarehouses,
  getMission,
  getOperatorReport,
  getOperatorReportAudio,
  parseIncident,
  reviewWarehouseRequest,
  transcribeAudio,
  type GenerateInput,
  type Mission,
  type MissionViewResource,
  type OperatorReportDetail,
  type WarehouseMissionRequest,
} from "@/lib/mission-api";
import { blobToWavBase64 } from "@/lib/audio-wav";
import { ActionPlanView } from "./action-plan-view";
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

export function MissionView({ warehouseId }: { warehouseId: string }) {
  const role = useAuth((s) => s.user?.role);
  const actorId = useAuth((s) => s.user?.id);
  const queryClient = useQueryClient();
  const [missionId, setMissionId] = useState<string | null>(null);
  const [isReporterMission, setIsReporterMission] = useState(false);
  const [form, setForm] = useState({
    incidentType: "FLOOD",
    affectedPeople: 100,
    durationHours: 24,
    children: 0,
    elderly: 0,
    medicalSupportCases: 0,
  });
  const [incidentPoint, setIncidentPoint] = useState<LatLng | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);
  const [workflowError, setWorkflowError] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  const [reviewLocation, setReviewLocation] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  const [reviewRequests, setReviewRequests] = useState<Record<string, number>>({});
  const isRescue = role === "RESCUE";

  // Mở đúng nhiệm vụ khi bấm thông báo (chuông) — kể cả mission đã REJECTED/DEFERRED.
  const focusMissionId = useMissionFocus((s) => s.focusMissionId);
  const focusKind = useMissionFocus((s) => s.focusKind);
  const clearFocus = useMissionFocus((s) => s.clearFocus);
  useEffect(() => {
    if (focusMissionId) {
      setMissionId(focusMissionId);
      setIsReporterMission(focusKind === "operator-report");
      if (focusKind === "operator-report") setIncidentPoint(null);
      clearFocus();
    }
  }, [focusMissionId, focusKind, clearFocus]);

  const warehousesQuery = useQuery({
    queryKey: ["cluster-warehouses", warehouseId],
    queryFn: () => getClusterWarehouses(warehouseId),
    enabled: Boolean(warehouseId) && !isRescue,
  });

  const missionQueryKey = isReporterMission
    ? ["operator-report", missionId]
    : ["mission", missionId];
  const missionQuery = useQuery<MissionViewResource>({
    queryKey: missionQueryKey,
    queryFn: () =>
      isReporterMission ? getOperatorReport(missionId as string) : getMission(missionId as string),
    enabled: Boolean(missionId),
    refetchInterval: 5000, // Cập nhật trạng thái khi bộ phận khác hoàn tất phần việc.
  });
  const operatorReport = isReporterMission
    ? (missionQuery.data as OperatorReportDetail | undefined)
    : undefined;
  const mission: Mission | undefined = operatorReport
    ? {
        ...operatorReport,
        locationText: operatorReport.location,
        requirements: operatorReport.requirements.map((requirement) => ({
          ...requirement,
          allocations: null,
          neighborSuggestion: null,
        })),
      }
    : (missionQuery.data as Mission | undefined);

  useEffect(() => {
    const mission = missionQuery.data;
    if (!isReporterMission || !mission) return;
    setDescription(mission.reportText ?? "");
    setForm((current) => ({
      incidentType: mission.incidentType || current.incidentType,
      affectedPeople: mission.affectedPeople,
      durationHours: mission.durationHours,
      children: mission.children ?? 0,
      elderly: mission.elderly ?? 0,
      medicalSupportCases: mission.medicalSupportCases ?? 0,
    }));
    setIncidentPoint(null);
    setReviewLocation("location" in mission ? (mission.location ?? "") : "");
    if ("adminNote" in mission) setReviewNote(mission.adminNote ?? "");
    if ("requirements" in mission) {
      const next: Record<string, number> = {};
      for (const requirement of mission.requirements) {
        for (const allocation of requirement.allocations ?? []) {
          if (!allocation.warehouseId || !allocation.qty) continue;
          const key = `${allocation.warehouseId}:${requirement.sku}`;
          next[key] = (next[key] ?? 0) + allocation.qty;
        }
      }
      setReviewRequests(next);
    }
  }, [isReporterMission, missionQuery.data]);

  const genPlan = useMutation({
    mutationFn: () =>
      generatePlan({
        warehouseId,
        incident: form,
        ...(incidentPoint
          ? { incidentLat: incidentPoint.lat, incidentLng: incidentPoint.lng }
          : {}),
      }),
    onSuccess: (m: Mission) => {
      setMissionId(m.id);
      setPlanError(null);
    },
    onError: (err) =>
      setPlanError(
        err instanceof ApiError ? err.message : "Chưa thể lập phương án. Vui lòng thử lại.",
      ),
  });

  // Reporter analysis is an in-place operation. The generic manual/demo path below
  // intentionally retains parseIncident + generatePlan + optional demo coordinates.
  const analyze = useMutation<MissionViewResource>({
    mutationFn: async () => {
      if (isReporterMission) {
        if (!missionId) throw new Error("Không có Mission báo cáo để phân tích.");
        return analyzeOperatorReport(missionId);
      }
      const p = await parseIncident(description);
      const incident = {
        incidentType: p.incidentType,
        affectedPeople: p.affectedPeople,
        durationHours: p.durationHours,
        children: p.children,
        elderly: p.elderly,
        medicalSupportCases: p.medicalSupportCases,
      };
      setForm(incident); // phản chiếu lên form để cán bộ vẫn xem/sửa lại được sau
      return generatePlan({
        warehouseId,
        incident,
        ...(incidentPoint
          ? { incidentLat: incidentPoint.lat, incidentLng: incidentPoint.lng }
          : {}),
      });
    },
    onSuccess: (m) => {
      if (isReporterMission && m.id !== missionId) {
        setParseError("Máy chủ trả về Mission khác với báo cáo đang mở.");
        return;
      }
      setMissionId(m.id);
      setParseError(null);
      setPlanError(null);
      void queryClient.invalidateQueries({ queryKey: missionQueryKey });
    },
    onError: (err) => {
      setParseError(
        err instanceof ApiError
          ? err.message
          : "Chưa phân tích được mô tả. Thử diễn đạt rõ hơn hoặc nhập tay bên dưới.",
      );
    },
  });

  const reportAudioQuery = useQuery({
    queryKey: ["operator-report-audio", actorId, missionId],
    queryFn: () => getOperatorReportAudio(missionId as string),
    enabled: isReporterMission && Boolean(missionId) && missionQuery.data?.audio?.present === true,
    retry: false,
    gcTime: 0,
  });
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  useEffect(() => {
    const previousUrl = audioUrlRef.current;
    if (previousUrl) URL.revokeObjectURL(previousUrl);
    audioUrlRef.current = null;

    if (!isReporterMission || !missionQuery.data?.audio?.present || !reportAudioQuery.data) {
      setAudioUrl(null);
      return;
    }

    const nextUrl = URL.createObjectURL(reportAudioQuery.data);
    audioUrlRef.current = nextUrl;
    setAudioUrl(nextUrl);

    return () => {
      if (audioUrlRef.current === nextUrl) {
        URL.revokeObjectURL(nextUrl);
        audioUrlRef.current = null;
      }
    };
  }, [isReporterMission, missionQuery.data?.audio?.present, reportAudioQuery.data]);
  const downloadAudio = () => {
    if (!audioUrl) return;
    const link = document.createElement("a");
    link.href = audioUrl;
    link.download = `${missionId ?? "report"}.wav`;
    link.click();
  };

  const reporterAnalysisAvailable =
    isReporterMission &&
    mission?.status === "DRAFT" &&
    (mission.processingState === "SUBMITTED" || mission.processingState === "ANALYSIS_FAILED");
  const effectiveMissionQueryError = missionQuery.error;
  const isReporterDetail = isReporterMission && Boolean(missionId);
  const detailLoading = missionQuery.isLoading && isReporterDetail;
  const detailError = effectiveMissionQueryError && isReporterDetail;

  useEffect(() => {
    if (!isReporterMission) return;
    if (mission?.processingState === "ANALYZED") {
      setParseError(null);
    }
  }, [isReporterMission, mission?.processingState]);

  const reportAudioPanel = isReporterMission ? (
    <ReportAudioPanel
      metadata={mission?.audio}
      audioUrl={audioUrl}
      loading={reportAudioQuery.isLoading}
      error={reportAudioQuery.error}
      onDownload={downloadAudio}
    />
  ) : null;

  const approveReport = useMutation({
    mutationFn: () => {
      if (!missionId) throw new Error("Không có báo cáo để duyệt.");
      const requests = Object.entries(reviewRequests)
        .filter(([, quantity]) => Number.isInteger(quantity) && quantity > 0)
        .map(([key, quantity]) => {
          const [warehouseId, sku] = key.split(":");
          return { warehouseId, sku, quantity };
        });
      return approveOperatorReport(missionId, {
        location: reviewLocation,
        adminNote: reviewNote,
        requests,
      });
    },
    onSuccess: () => {
      setWorkflowError(null);
      void queryClient.invalidateQueries({ queryKey: missionQueryKey });
    },
    onError: (error) =>
      setWorkflowError(error instanceof Error ? error.message : "Chưa thể duyệt phương án."),
  });

  const reviewWarehouse = useMutation({
    mutationFn: (input: { requestId: string; requestedQuantity: number; adminNote?: string }) =>
      reviewWarehouseRequest(input.requestId, {
        requestedQuantity: input.requestedQuantity,
        adminNote: input.adminNote,
      }),
    onSuccess: () => {
      setWorkflowError(null);
      void queryClient.invalidateQueries({ queryKey: missionQueryKey });
    },
    onError: (error) =>
      setWorkflowError(error instanceof Error ? error.message : "Chưa thể cập nhật yêu cầu kho."),
  });

  const isAdmin = role === "ADMIN";
  const officialDistances = mission?.actionPlan
    ? new Map(
        mission.actionPlan.warehouses.map((w) => [
          w.name,
          { distanceKm: w.distanceKm, etaMinutes: w.etaMinutes },
        ]),
      )
    : undefined;
  const effectiveIncidentPoint =
    mission?.incidentLat != null && mission?.incidentLng != null
      ? { lat: mission.incidentLat, lng: mission.incidentLng }
    : isReporterMission
      ? null
      : incidentPoint;
  const reporterWorkflowAvailable = !isReporterMission || mission?.processingState === "ANALYZED";

  if (detailLoading) {
    return (
      <p role="status" className="app-panel p-6 text-sm text-[var(--text-muted)]">
        Đang tải báo cáo gốc…
      </p>
    );
  }
  if (detailError) {
    return (
      <p role="alert" className="app-panel p-6 text-sm text-[var(--color-critical)]">
        Không thể tải báo cáo gốc. Vui lòng thử lại.
      </p>
    );
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[380px_1fr]">
      {/* Cột trái: nhập tình huống (chỉ ADMIN lập) */}
      <div className="space-y-4">
        {isReporterMission && mission && (
          <section className="app-panel p-5">
            <h2 className="font-semibold">Báo cáo gốc của trưởng thôn</h2>
            <p className="mt-2 whitespace-pre-wrap rounded-md border bg-[var(--surface-2)] p-3 text-sm">
              {mission.reportText || "Không có nội dung văn bản."}
            </p>
            {mission.locationText && (
              <p className="mt-2 text-sm text-[var(--text-muted)]">
                Địa điểm: {mission.locationText}
              </p>
            )}
            <dl className="mt-3 grid grid-cols-2 gap-2 rounded-md border bg-[var(--surface-2)] p-3 text-xs">
              <ReportField
                label="Loại tình huống"
                value={
                  INCIDENT_TYPES.find((item) => item.value === form.incidentType)?.label ??
                  form.incidentType
                }
              />
              <ReportField label="Số người ảnh hưởng" value={form.affectedPeople} />
              <ReportField label="Thời gian dự kiến" value={`${form.durationHours} giờ`} />
              <ReportField
                label="Mức độ nghiêm trọng"
                value={
                  operatorReport?.severityLevel != null
                    ? `${operatorReport.severityLevel}/5`
                    : "Chờ phân tích"
                }
              />
              <ReportField label="Ưu tiên" value={operatorReport?.priority ?? "Chưa có"} />
              <ReportField label="Trẻ em" value={form.children} />
              <ReportField label="Người cao tuổi" value={form.elderly} />
              <ReportField label="Ca cần hỗ trợ y tế" value={form.medicalSupportCases} />
            </dl>
            <p className="mt-2 text-xs text-[var(--text-muted)]">
              Trạng thái xử lý: {mission.processingState ?? "Chưa xác định"}
            </p>
            {reportAudioPanel}
            {parseError && (
              <p role="alert" className="mt-3 text-sm text-[var(--color-critical)]">
                {parseError}
              </p>
            )}
            {mission.processingState === "ANALYSIS_FAILED" && !parseError && (
              <p role="alert" className="mt-3 text-sm text-[var(--color-critical)]">
                Lần phân tích trước chưa thành công. Có thể thử phân tích lại báo cáo gốc.
              </p>
            )}
            {reporterAnalysisAvailable && (
              <button
                type="button"
                onClick={() => analyze.mutate()}
                disabled={analyze.isPending}
                className="mt-4 rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-[var(--color-accent-fg)] disabled:opacity-60"
              >
                {analyze.isPending ? "Đang phân tích báo cáo…" : "Phân tích báo cáo gốc"}
              </button>
            )}
            {mission.processingState === "ANALYZING" && (
              <p role="status" className="mt-3 text-sm text-[var(--text-muted)]">
                Báo cáo đang được phân tích…
              </p>
            )}
            {mission.processingState === "ANALYZED" && (
              <p className="mt-3 text-sm text-[var(--color-ready)]">
                Đã phân tích báo cáo gốc trong Mission này.
              </p>
            )}
            {operatorReport && operatorReport.warehouseLogisticsEstimates.length > 0 && (
              <div className="mt-3 rounded-md border bg-[var(--surface-2)] p-3">
                <p className="text-xs font-semibold">Ước tính logistics từ kho đã chuẩn bị</p>
                <ul className="mt-2 space-y-1 text-xs text-[var(--text-muted)]">
                  {operatorReport.warehouseLogisticsEstimates.map((estimate) => (
                    <li key={`${estimate.warehouseName}-${estimate.calculatedAt}`}>
                      {estimate.warehouseName}: {estimate.etaMinutes} phút · {estimate.distanceKm} km ·{" "}
                      {estimate.source === "google" ? "Google" : "đường thẳng"} · tính lúc{" "}
                      {new Date(estimate.calculatedAt).toLocaleString("vi-VN")}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {operatorReport && (
              <dl className="mt-3 grid grid-cols-2 gap-2 rounded-md border p-3 text-xs">
                <ReportField label="Cập nhật lúc" value={formatReportDate(operatorReport.updatedAt)} />
                <ReportField label="Duyệt lúc" value={formatReportDate(operatorReport.approvedAt)} />
                <ReportField label="Hoàn thành lúc" value={formatReportDate(operatorReport.completedAt)} />
                <ReportField label="Ghi chú điều phối" value={operatorReport.adminNote ?? "Không có"} />
                <ReportField label="Lý do từ chối" value={operatorReport.rejectionReason ?? "Không có"} />
                <ReportField label="Kết quả giao" value={operatorReport.deliveryOutcome ?? "Chưa có"} />
                <ReportField label="Ghi chú giao" value={operatorReport.deliveryNote ?? "Không có"} />
              </dl>
            )}
            {operatorReport?.processingState === "ANALYZED" && operatorReport.status === "DRAFT" && (
              <AdminReportReview
                location={reviewLocation}
                note={reviewNote}
                report={operatorReport}
                quantities={reviewRequests}
                busy={approveReport.isPending}
                onLocation={setReviewLocation}
                onNote={setReviewNote}
                onQuantity={(key, value) =>
                  setReviewRequests((current) => ({ ...current, [key]: value }))
                }
                onApprove={() => approveReport.mutate()}
              />
            )}
          </section>
        )}
        {isAdmin && !isReporterMission && (
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
              disabled={genPlan.isPending}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-md bg-[var(--color-accent)] px-4 py-2.5 font-semibold text-[var(--color-accent-fg)] transition hover:brightness-95 active:translate-y-px disabled:opacity-60"
            >
              <ColorIcon name="mission" size={19} tone="orange" />
              {genPlan.isPending ? "Đang tính nhu cầu" : "Tính nhu cầu vật tư"}
            </button>
            {!incidentPoint && (
              <p className="mt-2 text-xs text-[var(--text-muted)]">
                Chưa có tọa độ — ETA logistics chỉ xuất hiện khi backend có dữ liệu vị trí đã lưu.
                Bấm trên bản đồ nếu cần đặt chính xác.
              </p>
            )}
            {planError && <p className="mt-2 text-xs text-[var(--color-critical)]">{planError}</p>}
          </section>
        )}

        {isAdmin && !isReporterMission && (
          <section className="app-panel p-5">
            <h3 className="text-sm font-semibold">Vị trí sự cố và các kho</h3>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              {mission
                ? "Vị trí đã được ghi nhận trong phương án."
                : "Bấm trên bản đồ hoặc kéo dấu ghim đến vị trí xảy ra sự cố."}
            </p>
            <div className="mt-3">
              <IncidentMap
                warehouses={warehousesQuery.data ?? []}
                incidentPoint={effectiveIncidentPoint}
                onPickPoint={mission ? undefined : setIncidentPoint}
                officialDistances={officialDistances}
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
        {!mission ? (
          <EmptyState isAdmin={isAdmin} />
        ) : (
          <>
            {mission.readinessAssessment && (
              <MissionReadinessPanel assessment={mission.readinessAssessment} />
            )}
            <section className="app-panel p-5">
              <WorkflowStepper status={mission.status} />
              <div className="mt-5 border-t pt-4">
                <RoleActions
                  mission={mission}
                  role={role}
                  workflowEnabled={reporterWorkflowAvailable}
                />
              </div>
              {workflowError && (
                <p className="mt-3 text-sm text-[var(--color-critical)]">{workflowError}</p>
              )}
            </section>

            {mission.actionPlan ? (
              <ActionPlanView
                plan={mission.actionPlan}
                incidentPoint={effectiveIncidentPoint}
                isReporterMission={isReporterMission}
              />
            ) : (
              <div className="rounded-md border border-dashed bg-[var(--surface)] p-8 text-center text-sm text-[var(--text-muted)]">
                Chọn <b>Lập kế hoạch cứu hộ</b> để tạo các bước thực hiện chi tiết.
              </div>
            )}
            {(operatorReport?.warehouseRequests.length ?? mission.warehouseRequests?.length ?? 0) > 0 && (
              <PickupPlan
                requests={operatorReport?.warehouseRequests ?? mission.warehouseRequests ?? []}
                sourceHamlet={operatorReport?.sourceHamlet.name ?? mission.warehouse?.name ?? "Chưa xác định"}
                location={operatorReport?.location ?? mission.locationText ?? null}
                isAdmin={isAdmin}
                busy={reviewWarehouse.isPending}
                onReview={(requestId, requestedQuantity, adminNote) =>
                  reviewWarehouse.mutate({ requestId, requestedQuantity, adminNote })
                }
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ReportField({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <dt className="text-[var(--text-muted)]">{label}</dt>
      <dd className="mt-0.5 font-medium">{value}</dd>
    </div>
  );
}

function formatReportDate(value: string | null): string {
  return value ? new Date(value).toLocaleString("vi-VN") : "Chưa có";
}

function AdminReportReview({
  report,
  location,
  note,
  quantities,
  busy,
  onLocation,
  onNote,
  onQuantity,
  onApprove,
}: {
  report: OperatorReportDetail;
  location: string;
  note: string;
  quantities: Record<string, number>;
  busy: boolean;
  onLocation: (value: string) => void;
  onNote: (value: string) => void;
  onQuantity: (key: string, value: number) => void;
  onApprove: () => void;
}) {
  const recommendations = new Map<string, { warehouseId: string; warehouseName: string; sku: string; itemName: string; unit: string; maximum: number }>();
  for (const requirement of report.requirements) {
    for (const allocation of requirement.allocations ?? []) {
      if (!allocation.warehouseId || !allocation.warehouseName || !allocation.qty) continue;
      const key = `${allocation.warehouseId}:${requirement.sku}`;
      const current = recommendations.get(key);
      recommendations.set(key, {
        warehouseId: allocation.warehouseId,
        warehouseName: allocation.warehouseName,
        sku: requirement.sku,
        itemName: requirement.itemName,
        unit: requirement.unit,
        maximum: (current?.maximum ?? 0) + allocation.qty,
      });
    }
  }
  return (
    <div className="mt-4 rounded-md border bg-[var(--surface-2)] p-4">
      <h3 className="text-sm font-semibold">Admin kiểm tra và duyệt phương án</h3>
      <p className="mt-1 text-xs text-[var(--text-muted)]">
        Nhu cầu do AI đề xuất. Chỉ khi duyệt, hệ thống mới gửi đúng phần việc tới từng kho và đội cứu hộ.
      </p>
      <label className="mt-3 block text-xs font-medium">
        Vị trí cụ thể
        <input className="mt-1 w-full rounded-md border bg-[var(--surface)] px-3 py-2 text-sm" maxLength={300} onChange={(event) => onLocation(event.target.value)} value={location} />
      </label>
      <div className="mt-3 space-y-2">
        {[...recommendations.entries()].map(([key, item]) => (
          <label className="grid grid-cols-[1fr_110px] items-center gap-3 rounded-md border bg-[var(--surface)] p-3 text-sm" key={key}>
            <span>{item.warehouseName} · {item.itemName} (tối đa {item.maximum} {item.unit})</span>
            <input className="rounded-md border px-2 py-1.5" max={item.maximum} min={0} onChange={(event) => onQuantity(key, Number(event.target.value))} type="number" value={quantities[key] ?? item.maximum} />
          </label>
        ))}
      </div>
      <label className="mt-3 block text-xs font-medium">
        Ghi chú cho các đơn vị
        <textarea className="mt-1 w-full rounded-md border bg-[var(--surface)] px-3 py-2 text-sm" maxLength={1000} onChange={(event) => onNote(event.target.value)} rows={2} value={note} />
      </label>
      <button className="mt-3 rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-[var(--color-accent-fg)] disabled:opacity-50" disabled={busy || recommendations.size === 0} onClick={onApprove} type="button">
        {busy ? "Đang duyệt…" : "Duyệt và gửi đội cứu hộ, các kho"}
      </button>
    </div>
  );
}

function PickupPlan({
  requests,
  sourceHamlet,
  location,
  isAdmin,
  busy,
  onReview,
}: {
  requests: WarehouseMissionRequest[];
  sourceHamlet: string;
  location: string | null;
  isAdmin: boolean;
  busy: boolean;
  onReview: (requestId: string, requestedQuantity: number, adminNote: string) => void;
}) {
  const grouped = new Map<string, { name: string; items: WarehouseMissionRequest[] }>();
  for (const request of requests) {
    const current = grouped.get(request.warehouseId) ?? { name: request.warehouse.name, items: [] };
    current.items.push(request);
    grouped.set(request.warehouseId, current);
  }
  return (
    <section className="app-panel p-5">
      <h2 className="font-semibold">Thông tin lấy vật tư cho đội cứu hộ</h2>
      <p className="mt-2 text-sm">Thôn báo cáo: <b>{sourceHamlet}</b></p>
      {location && <p className="mt-1 text-sm">Vị trí cụ thể: {location}</p>}
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {[...grouped.entries()].map(([warehouseId, group]) => (
          <div className="rounded-md border bg-[var(--surface-2)] p-4" key={warehouseId}>
            <p className="font-semibold">{group.name}</p>
            <ul className="mt-2 space-y-1 text-sm">
              {group.items.map((item) => (
                <li key={item.id}>
                  {item.itemName}: {item.requestedQuantity} {item.unit} · {item.status === "PREPARED" ? "đã sẵn sàng" : item.status === "ACCEPTED" ? "đang chuẩn bị" : "chờ kho tiếp nhận"}
                  {isAdmin && item.warehouseNote && item.status !== "PREPARED" ? (
                    <WarehouseReviewControls
                      request={item}
                      busy={busy}
                      onReview={onReview}
                    />
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

function WarehouseReviewControls({
  request,
  busy,
  onReview,
}: {
  request: WarehouseMissionRequest;
  busy: boolean;
  onReview: (requestId: string, requestedQuantity: number, adminNote: string) => void;
}) {
  const [quantity, setQuantity] = useState(String(request.requestedQuantity));
  const [note, setNote] = useState(request.adminNote ?? "");
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <input
        aria-label={`Số lượng duyệt lại ${request.itemName}`}
        className="w-24 rounded border px-2 py-1 text-xs"
        min={1}
        onChange={(event) => setQuantity(event.target.value)}
        type="number"
        value={quantity}
      />
      <input
        aria-label={`Ghi chú duyệt lại ${request.itemName}`}
        className="min-w-48 flex-1 rounded border px-2 py-1 text-xs"
        maxLength={1000}
        onChange={(event) => setNote(event.target.value)}
        placeholder="Ghi chú cho kho"
        value={note}
      />
      <button
        className="rounded border px-2 py-1 text-xs font-semibold disabled:opacity-50"
        disabled={busy || !Number.isInteger(Number(quantity)) || Number(quantity) < 1}
        onClick={() => onReview(request.id, Number(quantity), note)}
        type="button"
      >
        Duyệt lại yêu cầu
      </button>
    </div>
  );
}

function ReportAudioPanel({
  metadata,
  audioUrl,
  loading,
  error,
  onDownload,
}: {
  metadata: Mission["audio"];
  audioUrl: string | null;
  loading: boolean;
  error: unknown;
  onDownload: () => void;
}) {
  if (!metadata?.present) {
    return (
      <p className="mt-3 text-xs text-[var(--text-muted)]">Báo cáo này không có bản ghi âm.</p>
    );
  }
  if (loading)
    return (
      <p role="status" className="mt-3 text-xs text-[var(--text-muted)]">
        Đang tải bản ghi âm riêng tư…
      </p>
    );
  if (error)
    return (
      <p role="alert" className="mt-3 text-xs text-[var(--color-critical)]">
        Không thể tải bản ghi âm riêng tư.
      </p>
    );
  if (!audioUrl)
    return <p className="mt-3 text-xs text-[var(--text-muted)]">Bản ghi âm chưa sẵn sàng.</p>;
  return (
    <div className="mt-3 space-y-2">
      <audio
        controls
        preload="metadata"
        src={audioUrl}
        className="w-full"
        aria-label="Bản ghi âm gốc của báo cáo"
      />
      <button
        type="button"
        onClick={onDownload}
        className="rounded-md border px-3 py-1.5 text-xs font-semibold"
      >
        Tải WAV gốc
      </button>
    </div>
  );
}

/** Nút hành động hiện theo role + trạng thái — người dùng chỉ thấy việc của mình. */
function RoleActions({
  mission,
  role,
  workflowEnabled,
}: {
  mission: Mission;
  role: string | undefined;
  workflowEnabled: boolean;
}) {
  const isAdmin = role === "ADMIN";
  const showReason =
    (mission.status === "REJECTED" || mission.status === "DEFERRED") && mission.rejectionReason;

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

      <div className="flex flex-wrap gap-2">
        {!workflowEnabled && (
          <p className="text-sm text-[var(--text-muted)]">
            Phân tích báo cáo gốc trước khi thực hiện các bước điều phối.
          </p>
        )}
        {workflowEnabled && isAdmin && mission.status === "DRAFT" && (
          <p className="text-sm text-[var(--text-muted)]">
            Admin duyệt trực tiếp ở bảng kiểm tra phương án; thao tác duyệt sẽ phát hành tới đội cứu hộ và các kho.
          </p>
        )}

        {workflowEnabled && role === "RESCUE" && (
          <p className="text-sm text-[var(--text-muted)]">
            Đội cứu hộ chỉ xem phương án và tự tới các kho được chỉ định để lấy vật tư.
          </p>
        )}

        {workflowEnabled && !actionableFor(mission.status, role) && (
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
  if (role === "RESCUE") return false;
  if (role === "WAREHOUSE") return false;
  return false;
}

function statusHint(status: string, role: string | undefined): string {
  if (status === "READY") return "Kho đã chuẩn bị xong và sẵn sàng giao vật tư cho đội cứu hộ.";
  if (status === "APPROVED") return "Phương án đã duyệt; các kho đang tiếp nhận và chuẩn bị vật tư.";
  if (status === "PENDING_RESCUE") return "Đội cứu hộ đã nhận thông tin và tự tới các kho được chỉ định.";
  if (status === "PENDING_WAREHOUSE") return "Đang chờ kho chuẩn bị vật tư.";
  if (status === "DRAFT" && role !== "ADMIN") return "Bộ phận điều phối đang lập kế hoạch.";
  if (status === "REJECTED") return "Bản ghi lịch sử đã bị từ chối trước đây.";
  if (status === "DEFERRED") return "Bản ghi lịch sử đã được tạm hoãn trước đây.";
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
