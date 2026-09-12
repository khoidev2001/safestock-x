"use client";

import { Fragment } from "react";
import { ColorIcon, type ColorIconName } from "@/components/shared/color-icon";
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
  { key: "admin", label: "Lập kế hoạch và phát hành", role: "ADMIN", icon: "workflow" },
  { key: "warehouse", label: "Kho chuẩn bị và xuất", role: "WAREHOUSE", icon: "house" },
  {
    key: "rescue",
    label: `${FIELD_FORCE_ROLE_LABEL} đã hoàn thành`,
    role: "RESCUE",
    icon: "helmet",
  },
  // Bước CUỐI, và nó thuộc về KHO chứ không phải hiện trường: hàng tái sử dụng
  // phải quay về kho, và người đếm lại nó khi về tới nơi mới ký được bước này.
  {
    key: "returned",
    label: "Đã hoàn trả vật tư",
    role: "WAREHOUSE",
    icon: "house",
  },
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
  hasReturnableSupplies,
}: {
  status: MissionStatus;
  /** Phiếu vật tư của nhiệm vụ — mốc "kho xong" đọc theo chữ ký nhận của đội. */
  warehouseRequests?: { status: string }[] | null;
  /** Có vật tư tái sử dụng nào đang nằm ngoài kho không; `false` là không cần trả. */
  hasReturnableSupplies?: boolean;
}) {
  const done = completedStepIndex(status, warehouseRequests);
  const active = activeStepIndex(status, warehouseRequests);
  const offFlow = OFF_FLOW[status];
  /**
   * Nhiệm vụ chỉ phát đồ tiêu hao: giao xong là hết, không ai phải mang gì về.
   *
   * Bước cuối vẫn phải có người ký để khép sổ, nên nó CHƯA xong — nhưng dán
   * "Đang chờ" lên đây là báo điều phối đi đòi một khoản nợ không tồn tại, và
   * người trực sẽ gọi kho hỏi về mấy cái áo phao chưa bao giờ rời kệ.
   */
  const nothingToReturn = status === "COMPLETED" && hasReturnableSupplies === false;

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
                <p className="text-xs font-medium leading-tight">{step.label}</p>
                {isActive &&
                  !isDone &&
                  (step.key === "returned" && nothingToReturn ? (
                    // Màu chữ phụ, KHÔNG phải màu cảnh báo: đây là một lời trấn
                    // an ("không có việc gì"), không phải một việc đang treo.
                    <p className="text-[10px] text-[var(--text-muted)]">Không cần trả</p>
                  ) : (
                    <p className="text-[10px] text-[var(--color-attention)]">Đang chờ</p>
                  ))}
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
