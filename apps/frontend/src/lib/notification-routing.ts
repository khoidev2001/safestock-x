export interface NotificationLike {
  kind: string;
  read: boolean;
  missionId?: string | null;
}

export interface IdentifiedNotification extends NotificationLike {
  id: string;
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
    case "MISSION_SUPPLIES_RETURNED":
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

/**
 * Thông báo chỉ BÁO TIẾN ĐỘ, không phải cảnh báo.
 *
 * Kho tiếp nhận yêu cầu, kho xác nhận xuất hàng — đó là việc chạy đúng quy trình,
 * người trực đọc để biết đã tới bước nào chứ không phải để phản ứng gấp.
 *
 * Thẻ thông báo mang theo loại thiên tai của nhiệm vụ để dựng biểu tượng, và trước
 * đây chỉ cần có trường đó là thẻ mặc nguyên bộ cánh cảnh báo: viền đỏ, nền pha đỏ,
 * bóng đổ đỏ. Thành ra một dòng "kho đã tiếp nhận" trông y hệt một sự cố đang cháy.
 * Tô đỏ mọi thứ thì màu đỏ thôi mang nghĩa "khẩn".
 */
export function isProgressNotification(kind: string): boolean {
  return kind === "WAREHOUSE_REQUEST_ACCEPTED" || kind === "WAREHOUSE_READY";
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

/**
 * Id của những thông báo CHƯA ĐỌC đang làm nên con số của một tab.
 *
 * Bấm vào tab là đã xem việc của tab đó, nên con số phải mất ngay tại đó. Trước
 * đây chỉ có mở chuông mới xoá được, nên người dùng bấm vào tab Nhiệm vụ, đọc
 * xong hết việc, quay ra vẫn thấy số đỏ y nguyên — rồi lần sau họ thôi không tin
 * con số nữa, đúng lúc nó đang báo một việc thật.
 *
 * Trả về danh sách id chứ không phải chỉ số đếm: đánh dấu đã đọc phải nhằm đúng
 * những bản ghi này, không được lây sang việc của tab khác đang còn chờ xử lý.
 */
export function unreadIdsForNavPath(
  notifications: IdentifiedNotification[],
  navPath: string,
): string[] {
  return notifications
    .filter((item) => !item.read && navPathForNotification(item.kind) === navPath)
    .map((item) => item.id);
}
