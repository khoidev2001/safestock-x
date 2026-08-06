import { CollapsiblePanel } from "@/components/shared/collapsible-panel";
import { ColorIcon } from "@/components/shared/color-icon";
import type { MissionReadinessAssessment, MissionReadinessStatus } from "@/lib/mission-api";

const STATUS_META: Record<MissionReadinessStatus, { label: string; color: string }> = {
  READY: { label: "Đủ khả năng đáp ứng", color: "var(--color-ready)" },
  NEEDS_ACTION: { label: "Đáp ứng một phần", color: "var(--color-attention)" },
  NOT_DISPATCHABLE: { label: "Chưa thể điều phối", color: "var(--color-critical)" },
};

export function MissionReadinessPanel({ assessment }: { assessment: MissionReadinessAssessment }) {
  const meta = STATUS_META[assessment.status];
  return (
    <CollapsiblePanel
      className="overflow-hidden rounded-md border bg-[var(--surface)] px-5 py-4"
      icon={<StatusIcon status={assessment.status} />}
      title="Khả năng đáp ứng nhiệm vụ"
      subtitle={
        <span className="font-semibold" style={{ color: meta.color }}>
          {meta.label}
        </span>
      }
      badge={<span className="tabular text-sm font-semibold">{assessment.fulfillment}%</span>}
    >
      {assessment.blockers.length > 0 && (
        <div className="mb-3 rounded-md bg-[color-mix(in_oklch,var(--color-critical)_6%,transparent)] px-4 py-3">
          {assessment.blockers.map((blocker) => (
            <div key={blocker.sku}>
              <p className="text-sm font-semibold">Thiếu hoàn toàn: {blocker.itemName}</p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">{blocker.reasons.join(" · ")}</p>
            </div>
          ))}
        </div>
      )}

      <div className="divide-y rounded-md border">
        {assessment.items.map((item) => (
          <div className="grid grid-cols-[1fr_auto] gap-3 px-4 py-3" key={item.sku}>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{item.itemName}</p>
              <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                Đáp ứng {item.allocated}/{item.required}, thiếu {item.shortage}
              </p>
            </div>
            <span
              className="self-center text-xs font-semibold"
              style={{ color: STATUS_META[item.status].color }}
            >
              {STATUS_META[item.status].label}
            </span>
          </div>
        ))}
      </div>
    </CollapsiblePanel>
  );
}

function StatusIcon({ status }: { status: MissionReadinessStatus }) {
  if (status === "READY") return <ColorIcon name="success" size={22} tone="green" />;
  if (status === "NOT_DISPATCHABLE") return <ColorIcon name="blocked" size={22} tone="red" />;
  return <ColorIcon name="warning" size={22} tone="amber" />;
}
