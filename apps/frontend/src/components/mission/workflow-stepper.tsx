"use client";

import { ColorIcon, type ColorIconName, type ColorIconTone } from "@/components/shared/color-icon";
import type { MissionStatus } from "@/lib/mission-api";
import { FIELD_FORCE_ROLE_LABEL } from "@safestock/shared-types";
import { activeStepIndex, completedStepIndex } from "./workflow-progress";

/**
 * Ba bước phối hợp, xếp đúng thứ tự của state machine điều phối.
 *
 * Xã phát hành phương án THẲNG tới kho nên hiện trường không xác nhận ở giữa;
 * họ đứng ở cuối, đi giao rồi báo kết quả để đóng nhiệm vụ. Trước đây thanh này
 * còn giữ thứ tự cũ (hiện trường xác nhận trước kho), nên nhiệm vụ vừa lập xong
 * hiện "Đang chờ" ở một bước không bao giờ xảy ra — người dùng ngồi đợi hiện
 * trường trong khi việc đang nằm ở tay chính họ.
 */
const STEPS = [
  {
    key: "admin",
    label: "Điều phối lập và phát hành",
    role: "ADMIN",
    icon: "workflow",
    tone: "blue",
  },
  {
    key: "warehouse",
    label: "Kho chuẩn bị và xuất",
    role: "WAREHOUSE",
    icon: "warehouse",
    tone: "green",
  },
  {
    key: "rescue",
    label: `${FIELD_FORCE_ROLE_LABEL} giao và báo kết quả`,
    role: "RESCUE",
    icon: "mission",
    tone: "orange",
  },
] satisfies {
  key: string;
  label: string;
  role: string;
  icon: ColorIconName;
  tone: ColorIconTone;
}[];

/** Trạng thái ngoài luồng 3 bước — hiện băng riêng thay vì stepper. */
const OFF_FLOW: Partial<Record<MissionStatus, { label: string; tone: string }>> = {
  REJECTED: {
    label: `${FIELD_FORCE_ROLE_LABEL} đã từ chối`,
    tone: "var(--color-critical)",
  },
  DEFERRED: { label: "Tạm hoãn — chờ điều phối cập nhật", tone: "var(--color-attention)" },
  CANCELLED: { label: "Nhiệm vụ đã huỷ", tone: "var(--text-muted)" },
};

export function WorkflowStepper({ status }: { status: MissionStatus }) {
  const done = completedStepIndex(status);
  const active = activeStepIndex(status);
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
        // Đúng một bước được gắn "Đang chờ": bước kế ngay sau bước đã xong.
        const isActive = i === active;
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
