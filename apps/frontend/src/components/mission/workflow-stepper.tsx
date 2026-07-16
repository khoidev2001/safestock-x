"use client";

import { Building2, Check, ClipboardList, LifeBuoy } from "lucide-react";
import type { MissionStatus } from "@/lib/mission-api";

/** 3 bước workflow liên role — trực quan ai đang chờ ai. */
const STEPS = [
  { key: "admin", label: "Cơ quan lập kế hoạch", role: "ADMIN", icon: ClipboardList },
  { key: "rescue", label: "Cứu hộ xác nhận", role: "RESCUE", icon: LifeBuoy },
  { key: "warehouse", label: "Kho chuẩn bị & giao", role: "WAREHOUSE", icon: Building2 },
] as const;

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
        const Icon = step.icon;
        const isDone = i <= done;
        const isActive = i === done + 1 || (i === done && status !== "READY" && status !== "COMPLETED");
        return (
          <div key={step.key} className="flex flex-1 items-center">
            <div className="flex flex-col items-center gap-1.5">
              <div
                className="flex h-10 w-10 items-center justify-center rounded-full border-2 transition"
                style={{
                  borderColor: isDone
                    ? "var(--color-accent)"
                    : isActive
                      ? "var(--color-attention)"
                      : "var(--border)",
                  background: isDone ? "var(--color-accent)" : "var(--surface)",
                  color: isDone ? "var(--color-accent-fg)" : "var(--text-muted)",
                }}
              >
                {isDone ? <Check size={18} strokeWidth={2.5} /> : <Icon size={18} strokeWidth={1.8} />}
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
