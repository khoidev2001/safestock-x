"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ColorIcon } from "@/components/shared/color-icon";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-store";
import { useMissionFocus } from "@/lib/mission-focus-store";
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
  getClusterWarehouses,
  getMission,
  prepareMission,
  resendMission,
  type DeliveryOutcome,
  type GenerateInput,
  type Mission,
} from "@/lib/mission-api";
import { ActionPlanView } from "./action-plan-view";
import { MissionReadinessPanel } from "./mission-readiness-panel";
import { WorkflowStepper } from "./workflow-stepper";

const IncidentMap = dynamic(() => import("./incident-map").then((m) => m.IncidentMap), {
  ssr: false,
  loading: () => <div className="h-[320px] animate-pulse rounded-md border bg-[var(--surface)]" />,
});

/** Tình huống mẫu — bấm nhanh, phòng khi cán bộ chưa quen nhập tay. */
const SAMPLES: { label: string; input: GenerateInput["incident"] }[] = [
  { label: "Lũ lụt 100 người", input: { incidentType: "FLOOD", affectedPeople: 100, durationHours: 24, children: 10, elderly: 5, medicalSupportCases: 3 } },
  { label: "Bão 50 người", input: { incidentType: "STORM", affectedPeople: 50, durationHours: 12, children: 5, elderly: 3, medicalSupportCases: 1 } },
  { label: "Sạt lở 30 người", input: { incidentType: "LANDSLIDE", affectedPeople: 30, durationHours: 48, children: 3, elderly: 2, medicalSupportCases: 4 } },
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
  const queryClient = useQueryClient();
  const [missionId, setMissionId] = useState<string | null>(null);
  const [form, setForm] = useState({ incidentType: "FLOOD", affectedPeople: 100, durationHours: 24, children: 0, elderly: 0, medicalSupportCases: 0 });
  const [incidentPoint, setIncidentPoint] = useState<LatLng | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);
  const [workflowError, setWorkflowError] = useState<string | null>(null);

  // Mở đúng nhiệm vụ khi bấm thông báo (chuông) — kể cả mission đã REJECTED/DEFERRED.
  const focusMissionId = useMissionFocus((s) => s.focusMissionId);
  const clearFocus = useMissionFocus((s) => s.clearFocus);
  useEffect(() => {
    if (focusMissionId) {
      setMissionId(focusMissionId);
      clearFocus();
    }
  }, [focusMissionId, clearFocus]);

  const warehousesQuery = useQuery({
    queryKey: ["cluster-warehouses", warehouseId],
    queryFn: () => getClusterWarehouses(warehouseId),
  });

  const missionQuery = useQuery({
    queryKey: ["mission", missionId],
    queryFn: () => getMission(missionId as string),
    enabled: Boolean(missionId),
    refetchInterval: 5000, // Cập nhật trạng thái khi bộ phận khác hoàn tất phần việc.
  });

  const genPlan = useMutation({
    mutationFn: () =>
      generatePlan({
        warehouseId,
        incident: form,
        incidentLat: incidentPoint?.lat,
        incidentLng: incidentPoint?.lng,
      }),
    onSuccess: (m: Mission) => {
      setMissionId(m.id);
      setPlanError(null);
    },
    onError: (err) => setPlanError(err instanceof ApiError ? err.message : "Chưa thể lập phương án. Vui lòng thử lại."),
  });

  const genActionPlan = useMutation({
    mutationFn: () => generateActionPlan(missionId as string),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["mission", missionId] }),
  });

  const step = useMutation({
    mutationFn: (fn: (id: string) => Promise<Mission>) => fn(missionId as string),
    onSuccess: () => {
      setWorkflowError(null);
      return queryClient.invalidateQueries({ queryKey: ["mission", missionId] });
    },
    onError: (err) => setWorkflowError(err instanceof ApiError ? err.message : "Chưa thể cập nhật nhiệm vụ. Vui lòng thử lại."),
  });

  const mission = missionQuery.data;
  const isAdmin = role === "ADMIN";
  const officialDistances = mission?.actionPlan
    ? new Map(mission.actionPlan.warehouses.map((w) => [w.name, { distanceKm: w.distanceKm, etaMinutes: w.etaMinutes }]))
    : undefined;
  const effectiveIncidentPoint =
    mission?.incidentLat != null && mission?.incidentLng != null
      ? { lat: mission.incidentLat, lng: mission.incidentLng }
      : incidentPoint;

  return (
    <div className="grid gap-4 xl:grid-cols-[380px_1fr]">
      {/* Cột trái: nhập tình huống (chỉ ADMIN lập) */}
      <div className="space-y-4">
        {isAdmin && (
          <section className="app-panel p-5">
            <h2 className="font-semibold">Tình huống khẩn cấp</h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Nhập quy mô ảnh hưởng để hệ thống tính nhu cầu vật tư ban đầu.
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              {SAMPLES.map((s) => (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => setForm({ children: 0, elderly: 0, medicalSupportCases: 0, ...s.input })}
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
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <NumberField label="Số người" value={form.affectedPeople} onChange={(v) => setForm({ ...form, affectedPeople: v })} />
                <NumberField label="Số giờ dự kiến" value={form.durationHours} onChange={(v) => setForm({ ...form, durationHours: v })} />
                <NumberField label="Trẻ em" value={form.children} onChange={(v) => setForm({ ...form, children: v })} />
                <NumberField label="Người già" value={form.elderly} onChange={(v) => setForm({ ...form, elderly: v })} />
                <NumberField label="Ca y tế" value={form.medicalSupportCases} onChange={(v) => setForm({ ...form, medicalSupportCases: v })} />
              </div>
            </div>

            <button
              type="button"
              onClick={() => genPlan.mutate()}
              disabled={genPlan.isPending || !incidentPoint}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-md bg-[var(--color-accent)] px-4 py-2.5 font-semibold text-[var(--color-accent-fg)] transition hover:brightness-95 active:translate-y-px disabled:opacity-60"
            >
              <ColorIcon name="mission" size={19} tone="orange" />
              {genPlan.isPending ? "Đang tính nhu cầu" : "Tính nhu cầu vật tư"}
            </button>
            {!incidentPoint && (
              <p className="mt-2 text-xs text-[var(--text-muted)]">Đánh dấu vị trí xảy ra sự cố trên bản đồ trước khi tiếp tục.</p>
            )}
            {planError && (
              <p className="mt-2 text-xs text-[var(--color-critical)]">{planError}</p>
            )}
          </section>
        )}

        {isAdmin && (
          <section className="app-panel p-5">
            <h3 className="text-sm font-semibold">Vị trí sự cố và các kho</h3>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              {mission ? "Vị trí đã được ghi nhận trong phương án." : "Bấm trên bản đồ hoặc kéo dấu ghim đến vị trí xảy ra sự cố."}
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
              {INCIDENT_TYPES.find((item) => item.value === mission.incidentType)?.label ?? mission.incidentType} · {mission.affectedPeople} người · có thể đáp ứng{" "}
              <b style={{ color: mission.fulfillment >= 70 ? "var(--color-ready)" : "var(--color-critical)" }}>
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
                  onGenerateActionPlan={() => genActionPlan.mutate()}
                  onDispatch={() => step.mutate(dispatchMission)}
                  onConfirm={() => step.mutate(confirmMission)}
                  onPrepare={() => step.mutate(prepareMission)}
                  onDefer={() => step.mutate(deferMission)}
                  onResend={(note) => step.mutate((id) => resendMission(id, note))}
                  onCancel={(note) => step.mutate((id) => cancelMission(id, note))}
                  onComplete={(outcome, note) => step.mutate((id) => completeMission(id, outcome, note))}
                  busy={genActionPlan.isPending || step.isPending}
                />
              </div>
              {workflowError && <p className="mt-3 text-sm text-[var(--color-critical)]">{workflowError}</p>}
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
  );
}

const actionBtn =
  "flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition active:translate-y-px disabled:opacity-60";
const primaryStyle = { background: "var(--color-accent)", color: "var(--color-accent-fg)" };

/** Nút hành động hiện theo role + trạng thái — người dùng chỉ thấy việc của mình. */
function RoleActions({
  mission,
  role,
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
  const showReason =
    (mission.status === "REJECTED" || mission.status === "DEFERRED") && mission.rejectionReason;
  // Admin huỷ được khi nhiệm vụ đang chạy nhưng kho CHƯA xuất vật tư.
  const adminCanCancelActive =
    isAdmin && ["PENDING_RESCUE", "RESCUE_CONFIRMED", "PENDING_WAREHOUSE"].includes(mission.status);

  return (
    <div className="space-y-4">
      {showReason && (
        <div className="rounded-md border border-[var(--color-critical)]/40 bg-[var(--color-critical)]/5 p-3">
          <p className="text-xs font-semibold text-[var(--color-critical)]">Lý do đội cứu hộ từ chối</p>
          <p className="mt-1 text-sm">{mission.rejectionReason}</p>
        </div>
      )}

      {mission.status === "COMPLETED" && mission.deliveryOutcome && (
        <DeliveryResultBanner outcome={mission.deliveryOutcome} note={mission.deliveryNote} />
      )}

      <div className="flex flex-wrap gap-2">
        {isAdmin && mission.status === "DRAFT" && (
          <>
            {!mission.actionPlan && (
              <button className={actionBtn} style={primaryStyle} onClick={onGenerateActionPlan} disabled={busy}>
                <ColorIcon name="mission" size={18} tone="orange" /> Lập kế hoạch cứu hộ
              </button>
            )}
            {mission.actionPlan && (
              <button
                className={actionBtn}
                style={primaryStyle}
                onClick={onDispatch}
                disabled={busy || mission.readinessAssessment?.status === "NOT_DISPATCHABLE"}
                title={mission.readinessAssessment?.status === "NOT_DISPATCHABLE" ? "Cần xử lý phần vật tư còn thiếu trước khi gửi" : undefined}
              >
                <ColorIcon name="send" size={18} tone="blue" /> Gửi cho đội cứu hộ
              </button>
            )}
          </>
        )}

        {role === "RESCUE" && mission.status === "PENDING_RESCUE" && (
          <button className={actionBtn} style={primaryStyle} onClick={onConfirm} disabled={busy}>
            Xác nhận nhận nhiệm vụ
          </button>
        )}

        {role === "WAREHOUSE" && mission.status === "PENDING_WAREHOUSE" && (
          <button className={actionBtn} style={primaryStyle} onClick={onPrepare} disabled={busy}>
            Chuẩn bị và xuất kho
          </button>
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
    return ["DRAFT", "PENDING_RESCUE", "RESCUE_CONFIRMED", "PENDING_WAREHOUSE", "REJECTED", "DEFERRED"].includes(status);
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
          <button className={actionBtn} style={{ background: "var(--color-critical)", color: "#fff" }} onClick={() => onCancel(note)} disabled={busy}>
            Xác nhận huỷ
          </button>
          <button className={`${actionBtn} border`} onClick={() => setCancelling(false)} disabled={busy}>
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
      <button className={`${actionBtn} border border-[var(--color-critical)] text-[var(--color-critical)]`} onClick={() => setCancelling(true)} disabled={busy}>
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
        placeholder={cancelling ? "Lý do huỷ nhiệm vụ" : "Ghi chú phản hồi cho đội cứu hộ (vd: đã điều thêm nhân lực/vật tư)"}
        className="w-full rounded-md border bg-[var(--surface)] px-3 py-2 text-sm"
      />
      <div className="flex flex-wrap gap-2">
        {cancelling ? (
          <>
            <button className={actionBtn} style={{ background: "var(--color-critical)", color: "#fff" }} onClick={() => onCancel(note)} disabled={busy}>
              Xác nhận huỷ
            </button>
            <button className={`${actionBtn} border`} onClick={() => setCancelling(false)} disabled={busy}>
              Quay lại
            </button>
          </>
        ) : (
          <>
            <button className={actionBtn} style={primaryStyle} onClick={() => onResend(note)} disabled={busy}>
              <ColorIcon name="send" size={18} tone="blue" /> Gửi lại cho đội cứu hộ
            </button>
            <button className={`${actionBtn} border border-[var(--color-critical)] text-[var(--color-critical)]`} onClick={() => setCancelling(true)} disabled={busy}>
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
function DeliveryResultBanner({ outcome, note }: { outcome: DeliveryOutcome; note?: string | null }) {
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
      <button className={actionBtn} style={primaryStyle} onClick={() => setConfirming(true)} disabled={busy}>
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
            style={outcome === o ? { borderColor: OUTCOME_META[o].tone, color: OUTCOME_META[o].tone } : undefined}
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
        <button className={actionBtn} style={primaryStyle} onClick={() => onComplete(outcome, note)} disabled={busy}>
          Hoàn thành nhiệm vụ
        </button>
        <button className={`${actionBtn} border`} onClick={() => setConfirming(false)} disabled={busy}>
          Quay lại
        </button>
      </div>
    </div>
  );
}

/** ADMIN huỷ nhiệm vụ đang chạy (kho chưa xuất) — bấm huỷ rồi nhập lý do xác nhận. */
function AdminCancelActive({ onCancel, busy }: { onCancel: (note: string) => void; busy: boolean }) {
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
        <button className={actionBtn} style={{ background: "var(--color-critical)", color: "#fff" }} onClick={() => onCancel(note)} disabled={busy}>
          Xác nhận huỷ
        </button>
        <button className={`${actionBtn} border`} onClick={() => setCancelling(false)} disabled={busy}>
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
  if (status === "DEFERRED") return "Nhiệm vụ đang tạm hoãn, chờ bộ phận điều phối cập nhật và gửi lại.";
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-[var(--text-muted)]">{label}</span>
      {children}
    </label>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
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
