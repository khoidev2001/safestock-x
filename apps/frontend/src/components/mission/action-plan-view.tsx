"use client";

import dynamic from "next/dynamic";
import { ColorIcon } from "@/components/shared/color-icon";
import type { ActionPlan } from "@/lib/mission-api";
import type { LatLng } from "@/lib/geo";

const IncidentMap = dynamic(() => import("./incident-map").then((m) => m.IncidentMap), {
  ssr: false,
  loading: () => <div className="h-[320px] animate-pulse rounded-md border bg-[var(--surface)]" />,
});

/** Màu theo mức khẩn cấp 1-5 — trực quan, người chưa rành nghiệp vụ đọc được ngay. */
const SEVERITY = [
  { label: "Rất thấp", color: "var(--color-ready)" },
  { label: "Thấp", color: "var(--color-ready)" },
  { label: "Trung bình", color: "var(--color-attention)" },
  { label: "Cao", color: "var(--color-degraded)" },
  { label: "Rất cao", color: "var(--color-critical)" },
];

export function ActionPlanView({
  plan,
  incidentPoint,
}: {
  plan: ActionPlan;
  incidentPoint?: LatLng | null;
}) {
  const sev = SEVERITY[Math.min(4, Math.max(0, plan.severityLevel - 1))];

  return (
    <div className="space-y-4">
      {/* Nêu rõ nguồn lập phương án để người dùng biết mức hỗ trợ tự động. */}
      <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
        <ColorIcon name="magic" size={16} tone="amber" />
        {plan.generatedBy === "ai"
          ? "Phương án được hỗ trợ tự động từ số liệu hiện có"
          : "Phương án dự phòng được lập từ quy tắc nghiệp vụ"}
      </div>

      {/* 1. Đánh giá tình huống + mức khẩn cấp */}
      <section
        className="rounded-md border p-5"
        style={{ background: `color-mix(in oklch, ${sev.color} 8%, var(--surface))` }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionTitle
            icon={<ColorIcon name="warning" size={19} tone="red" />}
            title="Đánh giá tình huống"
          />
          <span
            className="rounded-md px-3 py-1 text-sm font-semibold"
            style={{ background: sev.color, color: "white" }}
          >
            Mức {plan.severityLevel}/5 · {sev.label}
          </span>
        </div>
        <ul className="mt-3 space-y-1.5">
          {plan.severityReason.map((r, i) => (
            <li key={i} className="flex gap-2 text-sm">
              <span style={{ color: sev.color }}>•</span>
              <span>{r}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex gap-4 border-t pt-3 text-sm text-[var(--text-muted)]">
          <span>
            Độ tin cậy: <b className="text-[var(--text)]">{plan.confidence}%</b>
          </span>
          <span>
            Đáp ứng kho: <b className="text-[var(--text)]">{plan.fulfillment}%</b>
          </span>
        </div>
      </section>

      {/* 2. Mục tiêu cứu hộ */}
      <Panel icon={<ColorIcon name="target" size={19} tone="blue" />} title="Mục tiêu 6 giờ đầu">
        <ol className="space-y-2">
          {plan.narrative.objectives.map((o, i) => (
            <li key={i} className="flex gap-3 text-sm">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent)] text-xs font-bold text-[var(--color-accent-fg)]">
                {i + 1}
              </span>
              <span>{o}</span>
            </li>
          ))}
        </ol>
      </Panel>

      {/* 3. Phương án cấp phát vật tư */}
      <Panel
        icon={<ColorIcon name="inventory" size={19} tone="orange" />}
        title="Phương án cấp phát"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-[var(--text-muted)]">
                <th className="pb-2 pr-3 font-medium">Vật tư</th>
                <th className="pb-2 pr-3 text-right font-medium">Cần</th>
                <th className="pb-2 pr-3 text-right font-medium">Cấp</th>
                <th className="pb-2 pr-3 text-right font-medium">Thiếu</th>
                <th className="pb-2 font-medium">Lấy từ kho</th>
              </tr>
            </thead>
            <tbody>
              {plan.allocations.map((a) => (
                <tr key={a.sku} className="border-b last:border-0">
                  <td className="py-2 pr-3 font-medium">{a.itemName}</td>
                  <td className="tabular py-2 pr-3 text-right">{a.required}</td>
                  <td className="tabular py-2 pr-3 text-right">{a.allocated}</td>
                  <td
                    className="tabular py-2 pr-3 text-right font-semibold"
                    style={{
                      color: a.shortage > 0 ? "var(--color-critical)" : "var(--color-ready)",
                    }}
                  >
                    {a.shortage > 0 ? a.shortage : "—"}
                  </td>
                  <td className="py-2 text-xs text-[var(--text-muted)]">
                    {a.fromWarehouses.join(", ") || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* 4. Điều phối kho (ETA) */}
      {plan.warehouses.length > 0 && (
        <Panel
          icon={<ColorIcon name="location" size={19} tone="blue" />}
          title="Điều phối kho (thời gian tới điểm nạn)"
        >
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {plan.warehouses.map((w) => (
              <div key={w.id} className="rounded-md border bg-[var(--surface-2)] p-3">
                <p className="text-sm font-medium">{w.name}</p>
                <p className="tabular mt-1 text-xs text-[var(--text-muted)]">
                  {w.routeStatus === "ROUTED" && w.distanceKm != null
                    ? `${w.distanceKm} km · ~${w.etaMinutes} phút`
                    : `Chưa tính được tuyến (${w.routeStatus})`}
                </p>
                <ul className="mt-2 space-y-1 text-xs text-[var(--text-muted)]">
                  {w.contributions.map((item) => (
                    <li key={item.sku}>
                      {item.itemName}: <b>{item.quantity}</b> {item.unit}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          {incidentPoint ? (
            <div className="mt-3">
              <IncidentMap
                warehouses={plan.warehouses}
                incidentPoint={incidentPoint}
              />
            </div>
          ) : null}
        </Panel>
      )}

      {/* 5. Phương án theo giai đoạn */}
      <Panel
        icon={<ColorIcon name="time" size={19} tone="amber" />}
        title="Phương án theo giai đoạn"
      >
        <div className="space-y-3">
          {plan.narrative.phases.map((ph) => (
            <div key={ph.window} className="rounded-md border bg-[var(--surface-2)] p-3">
              <div className="mb-2 inline-flex items-center gap-2 rounded-md bg-[var(--color-accent)] px-2.5 py-1 text-xs font-semibold text-[var(--color-accent-fg)]">
                <ColorIcon name="time" size={15} tone="amber" />
                {ph.window}
              </div>
              <ul className="space-y-1.5">
                {ph.actions.map((a, i) => (
                  <li key={i} className="flex gap-2 text-sm">
                    <ColorIcon className="mt-0.5" name="success" size={17} tone="green" />
                    <span>{a}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Panel>

      {/* 6 + 7. Cảnh báo + Dự báo (2 cột) */}
      <div className="grid gap-4 md:grid-cols-2">
        <Panel
          icon={<ColorIcon name="warning" size={19} tone="red" />}
          title="Cảnh báo"
          tone="var(--color-degraded)"
        >
          <ul className="space-y-2">
            {plan.narrative.warnings.map((w, i) => (
              <li key={i} className="flex gap-2 text-sm">
                <ColorIcon className="mt-0.5" name="warning" size={16} tone="red" />
                <span>{w}</span>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel icon={<ColorIcon name="trendUp" size={19} tone="green" />} title="Dự báo">
          <div className="space-y-3">
            {plan.forecasts.map((f) => (
              <div key={f.label}>
                <div className="flex justify-between text-sm">
                  <span>{f.label}</span>
                  <span className="tabular font-semibold">{f.probability}%</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--surface-2)]">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${f.probability}%`,
                      background:
                        f.probability >= 60 ? "var(--color-critical)" : "var(--color-attention)",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {/* 8. Câu hỏi bổ sung */}
      <Panel icon={<ColorIcon name="help" size={19} tone="blue" />} title="Thông tin cần bổ sung">
        <div className="flex flex-wrap gap-2">
          {plan.narrative.followUpQuestions.map((q, i) => (
            <span key={i} className="rounded-md border bg-[var(--surface-2)] px-3 py-1.5 text-sm">
              {q}
            </span>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function SectionTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2 font-semibold">
      {icon}
      <span>{title}</span>
    </div>
  );
}

function Panel({
  icon,
  title,
  tone,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  tone?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-md border bg-[var(--surface)] p-5">
      <div
        className="mb-3 flex items-center gap-2 font-semibold"
        style={tone ? { color: tone } : undefined}
      >
        {icon}
        <span>{title}</span>
      </div>
      {children}
    </section>
  );
}
