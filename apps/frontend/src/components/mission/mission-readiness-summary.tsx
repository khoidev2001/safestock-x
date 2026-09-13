"use client";

import { ColorIcon } from "@/components/shared/color-icon";
import type { MissionReadinessAssessment, MissionReadinessStatus } from "@/lib/mission-api";

/**
 * Nhãn nói TÌNH TRẠNG, không nói việc phải làm — mọi hành động (hỏi mượn xã lân
 * cận, phân bổ lại) nằm ở khối "Mượn vật tư liên xã" ngay bên trên.
 */
const STATUS_META: Record<
  MissionReadinessStatus,
  { label: string; color: string; textColor: string }
> = {
  READY: {
    label: "Đã đáp ứng đủ",
    color: "var(--color-ready)",
    textColor: darken("var(--color-ready)"),
  },
  NEEDS_ACTION: {
    label: "Chưa đáp ứng đủ",
    color: "var(--color-attention)",
    textColor: darken("var(--color-attention)"),
  },
  NOT_DISPATCHABLE: {
    label: "Chưa đáp ứng đủ",
    color: "var(--color-critical)",
    textColor: darken("var(--color-critical)"),
  },
};

/**
 * Chữ trên nền đã pha màu phải đậm hơn chính màu đó. Vàng chuẩn (`--color-attention`)
 * sáng tới mức đặt lên nền vàng nhạt là gần như không đọc được.
 */
function darken(color: string) {
  return `color-mix(in srgb, ${color} 62%, black)`;
}

/**
 * Một dòng tóm tắt khả năng đáp ứng: tỉ lệ % và bao nhiêu loại vật tư đã đủ.
 *
 * Cố ý KHÔNG liệt kê lại từng vật tư. Bảng "Vật tư trong bản tham mưu" ngay phía
 * trên đã ghi đáp ứng/thiếu của từng dòng; một danh sách thứ hai ở đây chỉ bắt
 * người trực đọc hai lần cùng một bộ số.
 */
export function MissionReadinessSummary({
  assessment,
  className = "px-4 py-3",
}: {
  assessment: MissionReadinessAssessment;
  /** Chỉ lo khoảng đệm; nền, viền và bo góc đi theo tình trạng. */
  className?: string;
}) {
  const meta = STATUS_META[assessment.status];
  const readyCount = assessment.items.filter((item) => item.shortage <= 0).length;

  return (
    <section
      aria-labelledby="mission-readiness-title"
      className={`grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 rounded-md border-2 ${className}`}
      /* Nền đỏ / vàng / xanh lá theo tình trạng để khối nổi hẳn lên giữa các bảng
         trắng: đây là câu trả lời cuối cùng của cả phần vật tư. Pha từ chính màu
         tình trạng nên đổi màu chuẩn ở `globals.css` là khối này đổi theo.

         Pha trong `srgb`, KHÔNG `oklch`: `--surface` là màu xám không sắc độ (hue
         0), pha theo oklch thì sắc độ bị kéo về 0 — vàng và xanh lá ra hồng hết. */
      style={{
        background: `color-mix(in srgb, ${meta.color} 20%, var(--surface))`,
        borderColor: `color-mix(in srgb, ${meta.color} 60%, var(--surface))`,
      }}
    >
      <h4
        id="mission-readiness-title"
        className="flex min-w-0 items-center gap-2 text-sm font-semibold"
      >
        <StatusIcon status={assessment.status} />
        Khả năng đáp ứng nhiệm vụ
      </h4>
      <span className="tabular text-base font-bold" style={{ color: meta.textColor }}>
        {assessment.fulfillment}%
      </span>
      <p className="col-span-2 mt-1 text-sm font-semibold" style={{ color: meta.textColor }}>
        {meta.label}
        {/* Không có con số này thì một tỉ lệ như 87% treo lơ lửng, và câu hỏi kế
            tiếp luôn là "87% của cái gì". */}
        {assessment.items.length > 0 ? (
          <span className="font-normal text-[var(--text)]">
            {" "}
            · {readyCount}/{assessment.items.length} loại vật tư đã đủ
          </span>
        ) : null}
      </p>
    </section>
  );
}

function StatusIcon({ status }: { status: MissionReadinessStatus }) {
  if (status === "READY") return <ColorIcon name="success" size={20} tone="green" />;
  if (status === "NOT_DISPATCHABLE") return <ColorIcon name="blocked" size={20} tone="red" />;
  return <ColorIcon name="warning" size={20} tone="amber" />;
}
