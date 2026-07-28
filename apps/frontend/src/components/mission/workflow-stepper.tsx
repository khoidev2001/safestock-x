"use client";

import { ColorIcon, type ColorIconName, type ColorIconTone } from "@/components/shared/color-icon";
import type { MissionStatus } from "@/lib/mission-api";

/** Ba bước: AI phân tích, admin duyệt, các kho chuẩn bị. */
const STEPS = [
  { key: "analysis", label: "AI phân tích nhu cầu", role: "ADMIN", icon: "workflow", tone: "blue" },
  { key: "admin", label: "Admin kiểm tra và duyệt", role: "ADMIN", icon: "mission", tone: "orange" },
  {
    key: "warehouse",
    label: "Kho chuẩn bị và giao",
    role: "WAREHOUSE",
    icon: "warehouse",
    tone: "green",
  },
] satisfies {
  key: string;
  label: string;
  role: string;
  icon: ColorIconName;
  tone: ColorIconTone;
}[];

/** Trạng thái mission → bước nào đã xong (index cuối cùng hoàn tất). */
function completedIndex(status: MissionStatus): number {
  switch (status) {
    case "DRAFT":
    case "APPROVED":
      return status === "APPROVED" ? 1 : 0;
    case "PENDING_RESCUE":
    case "IN_PROGRESS":
      return 1;
    case "RESCUE_CONFIRMED":
    case "PENDING_WAREHOUSE":
      return 1;
    case "READY":
    case "COMPLETED":
      return 2; // xong hết
    default:
      return -1;
  }
}

/** Trạng thái ngoài luồng 3 bước — hiện băng riêng thay vì stepper. */
const OFF_FLOW: Partial<Record<MissionStatus, { label: string; tone: string }>> = {
  REJECTED: { label: "Bản ghi lịch sử đã bị từ chối", tone: "var(--color-critical)" },
  DEFERRED: { label: "Bản ghi lịch sử đã được tạm hoãn", tone: "var(--color-attention)" },
  CANCELLED: { label: "Nhiệm vụ đã huỷ", tone: "var(--text-muted)" },
};

export function WorkflowStepper({ status }: { status: MissionStatus }) {
  const done = completedIndex(status);
  const offFlow = OFF_FLOW[status];

  if (offFlow) {
    return (
      <div
        className="flex items-center gap-2 rounded-md border px-4 py-3"
        style={{ borderColor: offFlow.tone }}
      >
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: offFlow.tone }} />
        <span className="text-sm font-semibold" style={{ color: offFlow.tone }}>
          {offFlow.label}
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center">
      {STEPS.map((step, i) => {
        const isDone = i <= done;
        const isActive =
          i === done + 1 || (i === done && status !== "READY" && status !== "COMPLETED");
        return (
          <div key={step.key} className="flex flex-1 items-center">
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={`flex h-10 w-10 items-center justify-center transition ${isActive ? "scale-110" : ""}`}
              >
                <ColorIcon
                  name={isDone ? "success" : step.icon}
                  size={isDone ? 24 : 22}
                  tone={isDone ? "green" : step.tone}
                />
              </div>
              <div className="text-center">
                <p className="text-xs font-medium leading-tight">{step.label}</p>
                {isActive && !isDone && (
                  <p className="text-[10px] text-[var(--color-attention)]">Đang chờ</p>
                )}
              </div>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className="mx-2 h-0.5 flex-1"
                style={{ background: i < done ? "var(--color-accent)" : "var(--border)" }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
