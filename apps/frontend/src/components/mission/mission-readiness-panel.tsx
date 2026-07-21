import { AlertTriangle, Ban, CheckCircle2 } from "lucide-react";
import type { MissionReadinessAssessment, MissionReadinessStatus } from "@/lib/mission-api";

const STATUS_META: Record<MissionReadinessStatus, { label: string; color: string }> = {
  READY: { label: "Đủ khả năng đáp ứng", color: "var(--color-ready)" },
  NEEDS_ACTION: { label: "Đáp ứng một phần", color: "var(--color-attention)" },
  NOT_DISPATCHABLE: { label: "Chưa thể điều phối", color: "var(--color-critical)" },
};

export function MissionReadinessPanel({ assessment }: { assessment: MissionReadinessAssessment }) {
  const meta = STATUS_META[assessment.status];
  return (
    <section className="overflow-hidden rounded-md border bg-[var(--surface)]">
      <div className="flex items-start justify-between gap-4 border-b px-5 py-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5" style={{ color: meta.color }}><StatusIcon status={assessment.status} /></span>
          <div>
            <p className="text-xs font-medium uppercase text-[var(--text-muted)]">Khả năng đáp ứng nhiệm vụ</p>
            <h3 className="mt-1 font-semibold" style={{ color: meta.color }}>{meta.label}</h3>
          </div>
        </div>
        <span className="tabular shrink-0 text-sm font-semibold">{assessment.fulfillment}%</span>
      </div>

      {assessment.blockers.length > 0 && (
        <div className="border-b bg-[color-mix(in_oklch,var(--color-critical)_6%,transparent)] px-5 py-4">
          {assessment.blockers.map((blocker) => (
            <div key={blocker.sku}>
              <p className="text-sm font-semibold">Thiếu hoàn toàn: {blocker.itemName}</p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">{blocker.reasons.join(" · ")}</p>
            </div>
          ))}
        </div>
      )}

      <div className="divide-y">
        {assessment.items.map((item) => (
          <div className="grid grid-cols-[1fr_auto] gap-3 px-5 py-3" key={item.sku}>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{item.itemName}</p>
              <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                Cấp {item.allocated}/{item.required}, thiếu {item.shortage}
              </p>
            </div>
            <span className="self-center text-xs font-semibold" style={{ color: STATUS_META[item.status].color }}>
              {STATUS_META[item.status].label}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function StatusIcon({ status }: { status: MissionReadinessStatus }) {
  if (status === "READY") return <CheckCircle2 aria-hidden="true" size={21} />;
  if (status === "NOT_DISPATCHABLE") return <Ban aria-hidden="true" size={21} />;
  return <AlertTriangle aria-hidden="true" size={21} />;
}
