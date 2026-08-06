/**
 * Ánh xạ trạng thái nhiệm vụ → tiến trình 3 bước, tách riêng để khoá bằng test.
 *
 * Đây là bản sao ở phía web của state machine trong backend
 * (`apps/backend/src/mission/mission.workflow.ts`). Hai bên lệch nhau thì thanh
 * tiến trình sẽ chỉ sai người đang phải hành động — đúng lỗi đã gặp: nhiệm vụ
 * mới lập hiện "Đang chờ" ở bước hiện trường, trong khi việc nằm ở điều phối.
 */

/** Trạng thái nhiệm vụ, khớp `MissionStatus` của backend. */
export type WorkflowStatus =
  | "DRAFT"
  | "PENDING_WAREHOUSE"
  | "READY"
  | "COMPLETED"
  | "PENDING_RESCUE"
  | "RESCUE_CONFIRMED"
  | "REJECTED"
  | "DEFERRED"
  | "CANCELLED";

/** Số bước trên thanh tiến trình: điều phối → kho → hiện trường. */
export const WORKFLOW_STEP_COUNT = 3;

/**
 * Index của bước cuối cùng ĐÃ hoàn tất; -1 nghĩa là chưa bước nào xong.
 *
 * `PENDING_RESCUE` và `RESCUE_CONFIRMED` là trạng thái của luồng cũ, không
 * nhiệm vụ mới nào rơi vào nữa nhưng dữ liệu lịch sử vẫn còn; cả hai đều đã qua
 * bước phát hành nên xếp cùng `PENDING_WAREHOUSE`.
 */
export function completedStepIndex(status: WorkflowStatus): number {
  switch (status) {
    case "DRAFT":
      return -1;
    case "PENDING_WAREHOUSE":
    case "PENDING_RESCUE":
    case "RESCUE_CONFIRMED":
      return 0;
    case "READY":
      return 1;
    case "COMPLETED":
      return 2;
    default:
      return -1;
  }
}

/** Bước đang chờ hành động; null khi đã xong hết hoặc nhiệm vụ ra ngoài luồng. */
export function activeStepIndex(status: WorkflowStatus): number | null {
  const next = completedStepIndex(status) + 1;
  return next < WORKFLOW_STEP_COUNT ? next : null;
}
