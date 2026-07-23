import { MissionStatus } from "@prisma/client";

/**
 * State machine workflow cứu hộ liên role — hàm THUẦN (dễ test).
 * ADMIN sinh plan (DRAFT→PENDING_RESCUE) → RESCUE xác nhận (→RESCUE_CONFIRMED
 * →PENDING_WAREHOUSE) → WAREHOUSE chuẩn bị (→READY) → hoàn thành (→COMPLETED).
 */

/** Chuyển tiếp hợp lệ: từ trạng thái → các trạng thái đích cho phép. */
const TRANSITIONS: Record<string, MissionStatus[]> = {
  // Admin có thể huỷ bất kỳ lúc nào TRƯỚC khi kho xuất vật tư (chưa động tồn kho).
  [MissionStatus.DRAFT]: [MissionStatus.PENDING_RESCUE, MissionStatus.REJECTED, MissionStatus.CANCELLED],
  [MissionStatus.PENDING_RESCUE]: [
    MissionStatus.RESCUE_CONFIRMED,
    MissionStatus.REJECTED,
    MissionStatus.CANCELLED,
  ],
  // Đội đã nhận nhưng gặp sự cố → rút (REJECTED); admin cũng có thể huỷ.
  [MissionStatus.RESCUE_CONFIRMED]: [
    MissionStatus.PENDING_WAREHOUSE,
    MissionStatus.REJECTED,
    MissionStatus.CANCELLED,
  ],
  [MissionStatus.PENDING_WAREHOUSE]: [
    MissionStatus.READY,
    MissionStatus.REJECTED,
    MissionStatus.CANCELLED,
  ],
  // Kho đã xuất vật tư → chỉ còn hoàn thành (huỷ lúc này cần hoàn kho — ngoài phạm vi).
  [MissionStatus.READY]: [MissionStatus.COMPLETED],
  // Admin xử lý đơn từ chối của đội cứu hộ: tiếp nhận (tạm hoãn) hoặc huỷ.
  [MissionStatus.REJECTED]: [MissionStatus.DEFERRED, MissionStatus.CANCELLED],
  // Tạm hoãn: gửi lại cho đội cứu hộ (sau khi sửa/ghi chú) hoặc huỷ hẳn.
  [MissionStatus.DEFERRED]: [MissionStatus.PENDING_RESCUE, MissionStatus.CANCELLED],
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
