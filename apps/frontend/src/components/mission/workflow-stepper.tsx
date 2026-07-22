"use client";

import { ColorIcon, type ColorIconName, type ColorIconTone } from "@/components/shared/color-icon";
import type { MissionStatus } from "@/lib/mission-api";

/** Ba bước phối hợp giữa bộ phận điều phối, cứu hộ và kho. */
const STEPS = [
  { key: "admin", label: "Điều phối lập kế hoạch", role: "ADMIN", icon: "workflow", tone: "blue" },
  { key: "rescue", label: "Cứu hộ xác nhận", role: "RESCUE", icon: "mission", tone: "orange" },
  { key: "warehouse", label: "Kho chuẩn bị và giao", role: "WAREHOUSE", icon: "warehouse", tone: "green" },
] satisfies { key: string; label: string; role: string; icon: ColorIconName; tone: ColorIconTone }[];

/** Trạng thái mission → bước nào đã xong (index cuối cùng hoàn tất). */
function completedIndex(status: MissionStatus): number {
  switch (status) {
    case "DRAFT":
      return 0; // đã lập, chờ gửi
    case "PENDING_RESCUE":
      return 0; // chờ cứu hộ
    case "RESCUE_CONFIRMED":
    case "PENDING_WAREHOUSE":
      return 1; // cứu hộ xong, chờ kho
    case "READY":
    case "COMPLETED":
      return 2; // xong hết
    default:
      return -1;
  }
}

export function WorkflowStepper({ status }: { status: MissionStatus }) {
  const done = completedIndex(status);

  return (
    <div className="flex items-center">
      {STEPS.map((step, i) => {
        const isDone = i <= done;
        const isActive = i === done + 1 || (i === done && status !== "READY" && status !== "COMPLETED");
        return (
          <div key={step.key} className="flex flex-1 items-center">
            <div className="flex flex-col items-center gap-1.5">
              <div className={`flex h-10 w-10 items-center justify-center transition ${isActive ? "scale-110" : ""}`}>
                <ColorIcon name={isDone ? "success" : step.icon} size={isDone ? 24 : 22} tone={isDone ? "green" : step.tone} />
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
