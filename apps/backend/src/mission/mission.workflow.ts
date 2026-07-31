import { MissionStatus } from "@prisma/client";

/**
 * State machine điều phối vật tư — hàm thuần để khóa contract bằng test.
 *
 * ADMIN phát hành phương án trực tiếp tới các kho; lực lượng hiện trường không
 * tham gia bước phát hành. Nhưng họ ĐÓNG nhiệm vụ: sau khi kho chuẩn bị xong,
 * chính người đi giao báo kết quả thực tế.
 *
 * Không có bước đóng thì nhiệm vụ nằm mãi ở READY — vật tư đã trừ khỏi kho mà
 * không ai biết hàng tới nơi hay chưa, và hàng giao hỏng cũng không có đường
 * hoàn về.
 */

/** Chuyển tiếp hợp lệ: từ trạng thái → các trạng thái đích cho phép. */
const TRANSITIONS: Record<string, MissionStatus[]> = {
  [MissionStatus.DRAFT]: [MissionStatus.PENDING_WAREHOUSE, MissionStatus.CANCELLED],
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
