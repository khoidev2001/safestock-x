"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  HelpCircle,
  MapPin,
  Package,
  Sparkles,
  Target,
  TrendingUp,
} from "lucide-react";
import type { ActionPlan } from "@/lib/mission-api";

/** Màu theo mức khẩn cấp 1-5 — trực quan, người chưa rành nghiệp vụ đọc được ngay. */
const SEVERITY = [
  { label: "Rất thấp", color: "var(--color-ready)" },
  { label: "Thấp", color: "var(--color-ready)" },
  { label: "Trung bình", color: "var(--color-attention)" },
  { label: "Cao", color: "var(--color-degraded)" },
  { label: "Rất cao", color: "var(--color-critical)" },
];

export function ActionPlanView({ plan }: { plan: ActionPlan }) {
  const sev = SEVERITY[Math.min(4, Math.max(0, plan.severityLevel - 1))];

  return (
    <div className="space-y-4">
      {/* Nguồn sinh: AI hay template dự phòng */}
      <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
        <Sparkles size={14} strokeWidth={1.8} />
        {plan.generatedBy === "ai"
          ? "Kế hoạch do AI lập, số liệu từ hệ thống kho"
          : "Kế hoạch lập tự động (chế độ dự phòng, không cần mạng)"}
      </div>

      {/* 1. Đánh giá tình huống + mức khẩn cấp */}
      <section
        className="rounded-md border p-5"
        style={{ background: `color-mix(in oklch, ${sev.color} 8%, var(--surface))` }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionTitle icon={<AlertTriangle size={17} />} title="Đánh giá tình huống" />
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
      <Panel icon={<Target size={17} />} title="Mục tiêu 6 giờ đầu">
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
      <Panel icon={<Package size={17} />} title="Phương án cấp phát">
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
                    style={{ color: a.shortage > 0 ? "var(--color-critical)" : "var(--color-ready)" }}
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
        <Panel icon={<MapPin size={17} />} title="Điều phối kho (thời gian tới điểm nạn)">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {plan.warehouses.map((w) => (
              <div key={w.name} className="rounded-md border bg-[var(--surface-2)] p-3">
                <p className="text-sm font-medium">{w.name}</p>
                <p className="tabular mt-1 text-xs text-[var(--text-muted)]">
                  {w.distanceKm} km · ~{w.etaMinutes} phút
                </p>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {/* 5. Phương án theo giai đoạn */}
      <Panel icon={<Clock size={17} />} title="Phương án theo giai đoạn">
        <div className="space-y-3">
          {plan.narrative.phases.map((ph) => (
            <div key={ph.window} className="rounded-md border bg-[var(--surface-2)] p-3">
              <div className="mb-2 inline-flex items-center gap-2 rounded-md bg-[var(--color-accent)] px-2.5 py-1 text-xs font-semibold text-[var(--color-accent-fg)]">
                <Clock size={13} strokeWidth={2} />
                {ph.window}
              </div>
              <ul className="space-y-1.5">
                {ph.actions.map((a, i) => (
                  <li key={i} className="flex gap-2 text-sm">
                    <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-[var(--color-accent)]" />
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
        <Panel icon={<AlertTriangle size={17} />} title="Cảnh báo" tone="var(--color-degraded)">
          <ul className="space-y-2">
            {plan.narrative.warnings.map((w, i) => (
              <li key={i} className="flex gap-2 text-sm">
                <span style={{ color: "var(--color-degraded)" }}>⚠</span>
                <span>{w}</span>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel icon={<TrendingUp size={17} />} title="Dự báo">
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
      <Panel icon={<HelpCircle size={17} />} title="AI đề nghị bổ sung để tăng độ chính xác">
        <div className="flex flex-wrap gap-2">
          {plan.narrative.followUpQuestions.map((q, i) => (
            <span
              key={i}
              className="rounded-full border bg-[var(--surface-2)] px-3 py-1.5 text-sm"
            >
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
      <div className="mb-3 flex items-center gap-2 font-semibold" style={tone ? { color: tone } : undefined}>
        {icon}
        <span>{title}</span>
      </div>
      {children}
    </section>
  );
}
