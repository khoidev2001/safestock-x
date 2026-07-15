/** 4 vùng hành động theo điểm Readiness (C3). */
export enum ActionZone {
  READY = "READY", // 🟢 sẵn sàng
  ATTENTION = "ATTENTION", // 🟡 cần chú ý
  DEGRADED = "DEGRADED", // 🟠 suy giảm — báo quản lý
  CRITICAL = "CRITICAL", // 🔴 không đủ khả năng — chặn/cảnh báo lập nhiệm vụ
}

/** Ngưỡng phân vùng — chỉnh được mỗi kho (bảng ReadinessThreshold). */
export interface ActionThresholds {
  ready: number; // >= ready → READY
  attention: number; // >= attention → ATTENTION
  degraded: number; // >= degraded → DEGRADED; dưới → CRITICAL
}

export const DEFAULT_THRESHOLDS: ActionThresholds = {
  ready: 80,
  attention: 70,
  degraded: 50,
};

/**
 * Xác định vùng hành động từ điểm — hàm THUẦN.
 * Biến con số thành mệnh lệnh: mỗi vùng gắn hành động hệ thống tự làm.
 */
export function resolveActionZone(
  score: number,
  thresholds: ActionThresholds = DEFAULT_THRESHOLDS,
): ActionZone {
  if (score >= thresholds.ready) return ActionZone.READY;
  if (score >= thresholds.attention) return ActionZone.ATTENTION;
  if (score >= thresholds.degraded) return ActionZone.DEGRADED;
  return ActionZone.CRITICAL;
}

/** Vùng có cần chủ động thông báo quản lý không (suy giảm trở xuống). */
export function shouldNotifyManager(zone: ActionZone): boolean {
  return zone === ActionZone.DEGRADED || zone === ActionZone.CRITICAL;
}

/** Vùng có chặn/cảnh báo khi lập nhiệm vụ mới không (không đủ khả năng). */
export function shouldBlockNewMission(zone: ActionZone): boolean {
  return zone === ActionZone.CRITICAL;
}
