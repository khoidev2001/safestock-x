"use client";

import { Fragment } from "react";
import { ColorIcon, type ColorIconName } from "@/components/shared/color-icon";
import type { MissionStatus } from "@/lib/mission-api";
import { FIELD_FORCE_ROLE_LABEL } from "@safestock/shared-types";
import { activeStepIndex, completedStepIndex } from "./workflow-progress";

/**
 * Năm bước phối hợp, xếp đúng thứ tự của state machine điều phối.
 *
 * Điều phối lập bản tham mưu (mới chỉ có số lượng) → hiện trường chốt từng món
 * phải lấy bao nhiêu từ kho → điều phối lập kế hoạch và phát hành → kho xuất →
 * hiện trường giao xong → hoàn trả vật tư tái sử dụng.
 *
 * Hai bước của hiện trường không gộp làm một được, dù cùng một người bấm: bước
 * chốt số xảy ra TRƯỚC khi kho động vào hàng, bước giao xong xảy ra sau khi hàng
 * đã ra khỏi kho. Gộp lại là mất đúng chỗ mà con số của bản tham mưu được sửa.
 */
const STEPS = [
  { key: "admin", label: "Lập bản tham mưu", role: "ADMIN", icon: "workflow" },
  {
    key: "field-decision",
    label: `${FIELD_FORCE_ROLE_LABEL} chốt số cần lấy`,
    role: "RESCUE",
    icon: "helmet",
  },
  { key: "warehouse", label: "Kho chuẩn bị và xuất", role: "WAREHOUSE", icon: "house" },
  {
    key: "rescue",
    label: `${FIELD_FORCE_ROLE_LABEL} đã hoàn thành`,
    role: "RESCUE",
    icon: "helmet",
  },
  { key: "return", label: "Hoàn trả vật tư", role: "WAREHOUSE", icon: "house" },
] satisfies {
  key: string;
  label: string;
  role: string;
  icon: ColorIconName;
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

export function WorkflowStepper({
  status,
  warehouseRequests,
  warehouseStageSkipped,
  supplyPending,
}: {
  status: MissionStatus;
  /** Phiếu vật tư của nhiệm vụ — mốc "kho xong" đọc theo chữ ký nhận của đội. */
  warehouseRequests?: { status: string }[] | null;
  /** Hiện trường báo không cần lấy gì từ kho — chặng kho được bỏ qua. */
  warehouseStageSkipped?: boolean;
  /** Nhiệm vụ đã đóng nhưng đội còn giữ vật tư chưa trả về kho. */
  supplyPending?: boolean;
}) {
  const done = completedStepIndex(status, warehouseRequests, supplyPending);
  const active = activeStepIndex(status, warehouseRequests, supplyPending);
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
    /* Mỗi bước là một cột RIÊNG, rộng bằng nhau, chữ và hình cùng canh giữa cột;
       vạch nối là phần tử riêng nằm giữa hai cột.

       Trước đây vạch nối nằm BÊN TRONG ô của bước, nên hình và chữ bị đẩy hết về
       mép trái ô còn vạch chiếm phần còn lại — bước cuối không có vạch nên lại
       dạt sang trái ô của nó. Ba bước vì thế không bao giờ thẳng hàng với nhau.

       `items-start` để vạch nối không bị kéo giãn theo cột có chữ dài hai dòng. */
    <div className="flex items-start">
      {STEPS.map((step, i) => {
        const isDone = i <= done;
        // Đúng một bước được gắn "Đang chờ": bước kế ngay sau bước đã xong.
        const isActive = i === active;
        return (
          <Fragment key={step.key}>
            <div className="flex flex-1 flex-col items-center gap-1.5 text-center">
              {/* MÀU nói bước đã xong hay chưa, HÌNH giữ nguyên theo bước.
                  Xong thì xanh lá, chưa thì đen. Đổi luôn cả hình (trước đây bước
                  xong biến thành dấu tích) làm mất mốc nhận dạng: người đọc quét
                  thanh này bằng hình — nhà là kho, mũ bảo hộ là đội hiện trường —
                  mà hình lại biến đi đúng lúc cần đối chiếu.

                  Đen ở đây là `--text`, không phải #000 cứng: nền tối thì chữ đen
                  tuyền biến mất, còn `--text` tự đảo theo giao diện. */}
              <div
                className={`flex h-10 w-10 items-center justify-center transition ${isActive ? "scale-110" : ""}`}
                style={{ color: isDone ? "var(--color-accent)" : "var(--text)" }}
              >
                <ColorIcon mono name={step.icon} size={24} />
              </div>
              <div>
                {/* Chặng kho bị bỏ qua vẫn vẽ là ĐÃ XONG, chỉ đổi chữ. Vẽ nó dở
                    dang thì thanh tiến trình đứng mãi ở một bước không bao giờ
                    có ai làm, còn giấu hẳn cột đi thì năm bước thành bốn và
                    người quen nhìn vị trí sẽ đọc nhầm sang bước bên cạnh. */}
                <p className="text-xs font-medium leading-tight">
                  {step.key === "warehouse" && warehouseStageSkipped
                    ? "Không cần xuất kho"
                    : step.label}
                </p>
                {isActive && !isDone && (
                  <p className="text-[10px] text-[var(--color-attention)]">Đang chờ</p>
                )}
              </div>
            </div>
            {i < STEPS.length - 1 && (
              /* `mt-5` đẩy vạch xuống ngang tâm vòng tròn (ô hình cao 40px), để nó
                 nối hai hình chứ không trôi lên trên đầu chúng. */
              <div
                className="mx-2 mt-5 h-0.5 min-w-4 flex-1"
                style={{ background: i < done ? "var(--color-accent)" : "var(--border)" }}
              />
            )}
          </Fragment>
        );
      })}
    </div>
  );
}
