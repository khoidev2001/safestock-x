"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Send, Sparkles } from "lucide-react";
import dynamic from "next/dynamic";
import { useState } from "react";
import { useAuth } from "@/lib/auth-store";
import type { LatLng } from "@/lib/geo";
import { ApiError } from "@/lib/api";
import {
  confirmMission,
  dispatchMission,
  generateActionPlan,
  generatePlan,
  getClusterWarehouses,
  getMission,
  prepareMission,
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

  const warehousesQuery = useQuery({
    queryKey: ["cluster-warehouses", warehouseId],
    queryFn: () => getClusterWarehouses(warehouseId),
  });

  const missionQuery = useQuery({
    queryKey: ["mission", missionId],
    queryFn: () => getMission(missionId as string),
    enabled: Boolean(missionId),
    refetchInterval: 5000, // cập nhật trạng thái workflow từ role khác
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
    onError: (err) => setPlanError(err instanceof ApiError ? err.message : "Lỗi lập phương án"),
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
    onError: (err) => setWorkflowError(err instanceof ApiError ? err.message : "Không thể chuyển bước nhiệm vụ"),
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
          <section className="rounded-md border bg-[var(--surface)] p-5">
            <h2 className="font-semibold">Tình huống khẩn cấp</h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Chọn tình huống mẫu hoặc nhập chi tiết, rồi sinh phương án cứu hộ.
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
              <Sparkles size={17} strokeWidth={2} />
              {genPlan.isPending ? "Đang lập phương án…" : "Lập phương án phân bổ"}
            </button>
            {!incidentPoint && (
              <p className="mt-2 text-xs text-[var(--text-muted)]">Ghim điểm nạn trên bản đồ trước khi lập phương án.</p>
            )}
            {planError && (
              <p className="mt-2 text-xs text-[var(--color-critical)]">{planError}</p>
            )}
          </section>
        )}

        {isAdmin && (
          <section className="rounded-md border bg-[var(--surface)] p-5">
            <h3 className="text-sm font-semibold">Điểm nạn & kho trong xã</h3>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              {mission ? "Vị trí đã ghim khi lập phương án." : "Click hoặc kéo ghim lên bản đồ để đặt điểm nạn."}
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
          <section className="rounded-md border bg-[var(--surface)] p-5">
            <h3 className="text-sm font-semibold">Tóm tắt nhu cầu</h3>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              {mission.incidentType} · {mission.affectedPeople} người · đáp ứng{" "}
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
            <section className="rounded-md border bg-[var(--surface)] p-5">
              <WorkflowStepper status={mission.status} />
              <div className="mt-5 flex flex-wrap gap-2 border-t pt-4">
                <RoleActions
                  mission={mission}
                  role={role}
                  onGenerateActionPlan={() => genActionPlan.mutate()}
                  onDispatch={() => step.mutate(dispatchMission)}
                  onConfirm={() => step.mutate(confirmMission)}
                  onPrepare={() => step.mutate(prepareMission)}
                  busy={genActionPlan.isPending || step.isPending}
                />
              </div>
              {workflowError && <p className="mt-3 text-sm text-[var(--color-critical)]">{workflowError}</p>}
            </section>

            {mission.actionPlan ? (
              <ActionPlanView plan={mission.actionPlan} incidentPoint={effectiveIncidentPoint} />
            ) : (
              <div className="rounded-md border border-dashed bg-[var(--surface)] p-8 text-center text-sm text-[var(--text-muted)]">
                Bấm <b>Sinh phương án cứu hộ</b> để AI lập kế hoạch hành động chi tiết.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** Nút hành động hiện theo role + trạng thái — người dùng chỉ thấy việc của mình. */
function RoleActions({
  mission,
  role,
  onGenerateActionPlan,
  onDispatch,
  onConfirm,
  onPrepare,
  busy,
}: {
  mission: Mission;
  role: string | undefined;
  onGenerateActionPlan: () => void;
  onDispatch: () => void;
  onConfirm: () => void;
  onPrepare: () => void;
  busy: boolean;
}) {
  const btn =
    "flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition active:translate-y-px disabled:opacity-60";
  const primary = { background: "var(--color-accent)", color: "var(--color-accent-fg)" };

  if (role === "ADMIN" && mission.status === "DRAFT") {
    return (
      <>
        {!mission.actionPlan && (
          <button className={btn} style={primary} onClick={onGenerateActionPlan} disabled={busy}>
            <Sparkles size={16} /> Sinh phương án cứu hộ
          </button>
        )}
        {mission.actionPlan && (
          <button
            className={btn}
            style={primary}
            onClick={onDispatch}
            disabled={busy || mission.readinessAssessment?.status === "NOT_DISPATCHABLE"}
            title={mission.readinessAssessment?.status === "NOT_DISPATCHABLE" ? "Xử lý blocker vật tư trước khi gửi" : undefined}
          >
            <Send size={16} /> Gửi cho đội cứu hộ
          </button>
        )}
      </>
    );
  }
  if (role === "RESCUE" && mission.status === "PENDING_RESCUE") {
    return (
      <button className={btn} style={primary} onClick={onConfirm} disabled={busy}>
        Xác nhận nhận nhiệm vụ
      </button>
    );
  }
  if (role === "WAREHOUSE" && mission.status === "PENDING_WAREHOUSE") {
    return (
      <button className={btn} style={primary} onClick={onPrepare} disabled={busy}>
        Chuẩn bị & xuất kho
      </button>
    );
  }
  return (
    <p className="text-sm text-[var(--text-muted)]">
      {statusHint(mission.status, role)}
    </p>
  );
}

function statusHint(status: string, role: string | undefined): string {
  if (status === "READY") return "✓ Kho đã chuẩn bị xong, sẵn sàng giao cho đội cứu hộ.";
  if (status === "PENDING_RESCUE") return "Đang chờ đội cứu hộ xác nhận.";
  if (status === "PENDING_WAREHOUSE") return "Đang chờ kho chuẩn bị vật tư.";
  if (status === "DRAFT" && role !== "ADMIN") return "Cơ quan đang lập kế hoạch.";
  return "Không có hành động cho vai trò của bạn ở bước này.";
}

function EmptyState({ isAdmin }: { isAdmin: boolean }) {
  return (
    <div className="rounded-md border border-dashed bg-[var(--surface)] p-10 text-center">
      <Sparkles className="mx-auto text-[var(--color-accent)]" size={28} />
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
