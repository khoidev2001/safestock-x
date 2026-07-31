import type { Incident } from "./backend";

/** Sự cố đã xử lý hoặc đã có người tiếp nhận thì không kéo chuông nữa. */
const SILENT_STATES = new Set(["RESOLVED", "ACKNOWLEDGED"]);

export interface AlarmSelection {
  /** Sự cố mới cần kéo chuông ngay. */
  ringing: Incident[];
  /** Tập id đã biết sau lượt này — truyền lại cho lượt sau. */
  knownIds: Set<string>;
}

/**
 * Chọn sự cố cần kéo chuông.
 *
 * Chuông phải kêu vì CÓ SỰ CỐ, không phải vì có người bấm nút — cảm biến thật
 * báo cháy lúc 2 giờ sáng thì không ai đang ngồi trước máy để bấm gì cả.
 *
 * `seeded = false` là lượt tải đầu sau khi đăng nhập: chỉ ghi nhận hiện trạng,
 * không hú lên vì những sự cố đã tồn tại từ trước. Người vừa mở máy không cần
 * bị dội chuông cho chuyện của hôm qua.
 */
export function selectAlarmingIncidents(
  incidents: Incident[],
  knownIds: ReadonlySet<string>,
  seeded: boolean,
): AlarmSelection {
  const active = incidents.filter((incident) => !SILENT_STATES.has(incident.state));
  const ringing = seeded ? active.filter((incident) => !knownIds.has(incident.id)) : [];

  // Chỉ giữ lại sự cố còn mở: cái đã đóng được quên đi, để nếu mở lại thì vẫn
  // được coi là mới và kéo chuông lần nữa.
  return { ringing, knownIds: new Set(active.map((incident) => incident.id)) };
}

/** Tiêu đề gộp cho nhiều sự cố cùng lúc. */
export function alarmTitleFor(incidents: Incident[]): string {
  return incidents.map((incident) => incident.title).join(" · ");
}
