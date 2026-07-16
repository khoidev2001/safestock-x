import { MissionStatus } from "@prisma/client";

/**
 * State machine workflow cứu hộ liên role — hàm THUẦN (dễ test).
 * ADMIN sinh plan (DRAFT→PENDING_RESCUE) → RESCUE xác nhận (→RESCUE_CONFIRMED
 * →PENDING_WAREHOUSE) → WAREHOUSE chuẩn bị (→READY) → hoàn thành (→COMPLETED).
 */

/** Chuyển tiếp hợp lệ: từ trạng thái → các trạng thái đích cho phép. */
const TRANSITIONS: Record<string, MissionStatus[]> = {
  [MissionStatus.DRAFT]: [MissionStatus.PENDING_RESCUE, MissionStatus.REJECTED],
  [MissionStatus.PENDING_RESCUE]: [MissionStatus.RESCUE_CONFIRMED, MissionStatus.REJECTED],
  [MissionStatus.RESCUE_CONFIRMED]: [MissionStatus.PENDING_WAREHOUSE],
  [MissionStatus.PENDING_WAREHOUSE]: [MissionStatus.READY, MissionStatus.REJECTED],
  [MissionStatus.READY]: [MissionStatus.COMPLETED],
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
