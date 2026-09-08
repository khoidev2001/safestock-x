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
  | "PENDING_FIELD_DECISION"
  | "FIELD_DECIDED"
  | "PENDING_WAREHOUSE"
  | "READY"
  | "COMPLETED"
  | "PENDING_RESCUE"
  | "RESCUE_CONFIRMED"
  | "REJECTED"
  | "DEFERRED"
  | "CANCELLED";

/**
 * Năm bước: tham mưu → hiện trường chốt số → kho xuất → hiện trường giao xong →
 * hoàn trả vật tư.
 *
 * Hai bước mới không phải là trang trí. Bước "chốt số" là chỗ DUY NHẤT đội cứu hộ
 * nói được rằng họ đang cầm sẵn hàng; bước "hoàn trả" là chỗ duy nhất sổ kho biết
 * hàng tái sử dụng đã về hay chưa. Thiếu chúng thì cả hai việc xảy ra ngoài hệ
 * thống, và tồn kho chỉ đúng cho tới đợt kiểm kê sau.
 */
export const WORKFLOW_STEP_COUNT = 5;

/** Một phiếu vật tư, chỉ cần trạng thái để biết đội đã ký nhận chưa. */
export interface RequestStatusLike {
  status: string;
}

/**
 * Đội đã ký nhận HẾT các phiếu vật tư chưa.
 *
 * Không có phiếu nào (nhiệm vụ cũ, dữ liệu trước khi tách phiếu theo vật tư) thì
 * coi như xong: không có chữ ký nào để chờ, bắt chờ là treo nhiệm vụ vĩnh viễn.
 */
export function allRequestsPickedUp(requests?: RequestStatusLike[] | null): boolean {
  if (!requests || requests.length === 0) return true;
  return requests.every((request) => request.status === "PICKED_UP");
}

/**
 * Index của bước cuối cùng ĐÃ hoàn tất; -1 nghĩa là chưa bước nào xong.
 *
 * `PENDING_RESCUE` và `RESCUE_CONFIRMED` là trạng thái của luồng cũ, không
 * nhiệm vụ mới nào rơi vào nữa nhưng dữ liệu lịch sử vẫn còn; cả hai đều đã qua
 * bước phát hành nên xếp cùng `PENDING_WAREHOUSE`.
 *
 * BƯỚC KHO CHỈ XONG KHI HÀNG ĐÃ RỜI KHO. Trạng thái `READY` của máy chủ chỉ nói
 * mọi kho đã SOẠN xong phần của mình (`mission-warehouse-request.service.ts`:
 * hết phiếu chưa xuất thì nhiệm vụ sang READY) — hàng lúc đó vẫn nằm trên sân
 * kho, chờ đội tới ký nhận. Tick xanh ngay lúc ấy là báo một tin mừng chưa xảy
 * ra: điều phối thấy "kho xong rồi" nên thôi không gọi nhắc, trong khi mười một
 * món vẫn nằm ở kho thôn không ai tới lấy.
 *
 * Đây đúng là luật mà `warehouseProgress` đã dùng cho từng kho ("XONG nghĩa là
 * ĐỘI ĐÃ KÝ NHẬN ĐỦ"); thanh tiến trình trước đây nói ngược lại với chính khối
 * nằm ngay dưới nó trên cùng một trang.
 *
 * Không truyền `requests` thì giữ nguyên cách đọc cũ theo trạng thái — bên gọi
 * nào chưa có danh sách phiếu vẫn chạy được.
 */
export function completedStepIndex(
  status: WorkflowStatus,
  requests?: RequestStatusLike[] | null,
  /** Nhiệm vụ đã đóng và đội còn giữ vật tư chưa trả về kho. */
  supplyPending?: boolean,
): number {
  switch (status) {
    case "DRAFT":
      return -1;
    // Đã gửi cho hiện trường: bước tham mưu xong, đang chờ họ trả lời.
    case "PENDING_FIELD_DECISION":
      return 0;
    // Hiện trường đã chốt; việc quay lại tay điều phối để lập kế hoạch và phát hành.
    case "FIELD_DECIDED":
      return 1;
    case "PENDING_WAREHOUSE":
    // Hai trạng thái của luồng cũ: dữ liệu lịch sử, đều đã qua bước phát hành.
    case "PENDING_RESCUE":
    case "RESCUE_CONFIRMED":
      return 1;
    case "READY":
      return allRequestsPickedUp(requests) ? 2 : 1;
    // Đóng nhiệm vụ mà còn nợ vật tư thì bước hoàn trả CHƯA xong. Tick xanh lúc
    // này là xoá khỏi màn hình đúng khoản duy nhất còn treo.
    case "COMPLETED":
      return supplyPending ? 3 : 4;
    default:
      return -1;
  }
}

/** Bước đang chờ hành động; null khi đã xong hết hoặc nhiệm vụ ra ngoài luồng. */
export function activeStepIndex(
  status: WorkflowStatus,
  requests?: RequestStatusLike[] | null,
  supplyPending?: boolean,
): number | null {
  const next = completedStepIndex(status, requests, supplyPending) + 1;
  return next < WORKFLOW_STEP_COUNT ? next : null;
}

/**
 * Chữ trên thẻ trạng thái sau khi nhiệm vụ đã đóng.
 *
 * Ba câu khác nhau chứ không phải hai: phần đang giữ có thể đã được CHUYỂN sang
 * nhiệm vụ khác, và lúc đó nói "đã hoàn trả" là sai — hàng vẫn ở ngoài kho, chỉ
 * là đang phục vụ việc khác.
 */
export function completionLabel(input: {
  warehouseStageSkipped?: boolean;
  heldCount: number;
  transferredCount: number;
}): string {
  if (input.heldCount > 0) return "Hoàn thành — chưa hoàn trả vật tư";
  if (input.transferredCount > 0) return "Hoàn thành — đã chuyển vật tư sang nhiệm vụ khác";
  return "Hoàn thành — đã hoàn trả vật tư";
}
