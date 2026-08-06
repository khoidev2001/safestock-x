export interface NotificationLike {
  kind: string;
  read: boolean;
  missionId?: string | null;
}

/**
 * Thông báo nào thuộc về tab nào.
 *
 * Dùng cho hai việc: gắn số lên tab để nhìn là biết chỗ nào có việc, và đưa
 * người bấm thông báo tới đúng nơi. Trước đây mọi thông báo chỉ nằm trong chuông
 * ở góc — muốn biết có việc gì phải chủ động mở ra xem, mà lúc đang chạy nhiều
 * việc thì không ai nhớ mở.
 *
 * Loại nào không rõ thuộc tab nào thì trả null: thà không gắn số còn hơn gắn
 * nhầm chỗ rồi bắt người dùng đi tìm một việc không có ở đó.
 */
export function navPathForNotification(kind: string): string | null {
  switch (kind) {
    case "INCIDENT_DETECTED":
    case "READINESS_DEGRADED":
      return "/incident";
    case "MISSION_ASSIGNED":
    case "RESCUE_CONFIRMED":
    case "WAREHOUSE_READY":
    case "MISSION_REJECTED":
    case "MISSION_DEFERRED":
    case "MISSION_CANCELLED":
    case "MISSION_COMPLETED":
    case "INCIDENT_REPORTED":
    case "FIELD_UPDATE_REPORTED":
    case "WAREHOUSE_REQUESTED":
    case "WAREHOUSE_REQUEST_ACCEPTED":
      return "/missions";
    case "INTER_WAREHOUSE_REQUEST":
      return "/loan";
    default:
      return null;
  }
}

/**
 * Loại thông báo phải ở lại trên màn hình cho tới khi có người bấm.
 *
 * Sự cố cảm biến là thứ duy nhất có thể đang cháy hoặc đang mất hàng ngay lúc
 * này. Mọi thông báo khác tự tắt sau vài giây — để chúng ở lại thì màn hình đầy
 * thẻ và người ta bắt đầu bấm tắt theo phản xạ, đúng lúc đó cái quan trọng cũng
 * bị tắt cùng.
 */
export function isStickyNotification(kind: string): boolean {
  return kind === "INCIDENT_DETECTED";
}

/** Số thông báo CHƯA ĐỌC của từng tab, để gắn lên thanh điều hướng. */
export function unreadByNavPath(notifications: NotificationLike[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of notifications) {
    if (item.read) continue;
    const path = navPathForNotification(item.kind);
    if (!path) continue;
    counts[path] = (counts[path] ?? 0) + 1;
  }
  return counts;
}
