import { MissionStatus } from "@prisma/client";

/**
 * State machine điều phối vật tư — hàm thuần để khóa contract bằng test.
 *
 * Bốn chặng, mỗi chặng một người quyết:
 *
 *  1. ADMIN lập BẢN THAM MƯU — mới chỉ có "cần bao nhiêu", chưa chọn kho nào.
 *     Rà lại danh sách rồi gửi cho lực lượng hiện trường.
 *  2. HIỆN TRƯỜNG chốt từng món lấy bao nhiêu từ kho. Họ là người duy nhất biết
 *     mình đang cầm sẵn những gì từ chuyến trước, nên bắt kho soạn đủ số định mức
 *     là bắt kho xuất lại đúng đống hàng đang nằm trên xe.
 *  3. ADMIN lập KẾ HOẠCH — tới đây mới tính lấy ở kho nào, xa bao nhiêu — rồi
 *     phát hành tới các kho. Không món nào cần lấy thì bỏ hẳn chặng kho.
 *  4. HIỆN TRƯỜNG đi giao và ĐÓNG nhiệm vụ. Không có bước đóng thì nhiệm vụ nằm
 *     mãi ở READY: vật tư đã trừ khỏi kho mà không ai biết hàng tới nơi hay chưa,
 *     và hàng giao hỏng cũng không có đường hoàn về.
 */

/** Chuyển tiếp hợp lệ: từ trạng thái → các trạng thái đích cho phép. */
const TRANSITIONS: Record<string, MissionStatus[]> = {
  // KHÔNG còn `DRAFT → PENDING_WAREHOUSE`. Để hở là đường phát hành cũ vẫn hợp
  // lệ và đi vòng qua trọn vẹn chặng hiện trường chốt số — nhiệm vụ ra tới kho
  // với số lượng chưa ai ngoài định mức nhìn qua.
  [MissionStatus.DRAFT]: [MissionStatus.PENDING_FIELD_DECISION, MissionStatus.CANCELLED],
  // Quay lại DRAFT là ADMIN THU HỒI để sửa bản tham mưu khi hiện trường chưa trả lời.
  [MissionStatus.PENDING_FIELD_DECISION]: [
    MissionStatus.FIELD_DECIDED,
    MissionStatus.DRAFT,
    MissionStatus.CANCELLED,
  ],
  // Thẳng tới READY khi hiện trường báo không cần lấy gì từ kho: không có việc
  // nào cho kho làm, bắt họ bấm "đã chuẩn bị xong" cho một danh sách rỗng chỉ
  // tổ dạy người ta bấm bừa qua các ô xác nhận.
  [MissionStatus.FIELD_DECIDED]: [
    MissionStatus.PENDING_WAREHOUSE,
    MissionStatus.READY,
    MissionStatus.CANCELLED,
  ],
  [MissionStatus.PENDING_WAREHOUSE]: [MissionStatus.READY, MissionStatus.CANCELLED],
  // Vật tư đã sẵn ở kho: việc còn lại là đi giao và báo kết quả thực tế.
  [MissionStatus.READY]: [MissionStatus.COMPLETED],
  // Các trạng thái cũ không còn được tạo mới; ADMIN vẫn có thể đóng dữ liệu lịch sử.
  [MissionStatus.PENDING_RESCUE]: [MissionStatus.CANCELLED],
  [MissionStatus.RESCUE_CONFIRMED]: [MissionStatus.CANCELLED],
  [MissionStatus.REJECTED]: [MissionStatus.CANCELLED],
  [MissionStatus.DEFERRED]: [MissionStatus.CANCELLED],
};

export function canTransition(from: MissionStatus, to: MissionStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

/** Ném thông điệp lỗi rõ ràng nếu chuyển tiếp không hợp lệ. */
export function assertTransition(from: MissionStatus, to: MissionStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`Không thể chuyển ${from} → ${to}`);
  }
}
