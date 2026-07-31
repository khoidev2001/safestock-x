export type MissionAction = "complete";

export const MISSION_STATUS_LABEL: Record<string, string> = {
  DRAFT: "Nháp",
  PENDING_RESCUE: "Chờ bạn nhận lệnh",
  RESCUE_CONFIRMED: "Đã nhận · chờ kho",
  PENDING_WAREHOUSE: "Kho đang chuẩn bị",
  READY: "Kho đã sẵn sàng · chờ giao",
  COMPLETED: "Hoàn thành",
  REJECTED: "Đã từ chối",
  DEFERRED: "Tạm hoãn",
  CANCELLED: "Đã huỷ",
};

/**
 * Việc lực lượng hiện trường được làm với một lệnh, theo đúng trạng thái của nó.
 *
 * Xã phát hành phương án thẳng tới kho, nên hiện trường không tham gia bước phát
 * hành. Vật tư đã sẵn ở kho thì việc còn lại là đi giao và báo kết quả thực tế.
 *
 * Chỉ hiện nút khi thao tác thực sự đi được: nút bấm vào là báo lỗi còn tệ hơn
 * không có nút, nhất là với người đang đứng ngoài mưa.
 */
export function fieldForceActionsFor(status: string): MissionAction[] {
  return status === "READY" ? ["complete"] : [];
}

/** Lệnh còn đang chạy thì xếp lên trước; việc đã đóng đẩy xuống dưới. */
const CLOSED_STATUSES = new Set(["COMPLETED", "REJECTED", "CANCELLED"]);

export function isMissionOpen(status: string): boolean {
  return !CLOSED_STATUSES.has(status);
}

export interface SortableMission {
  status: string;
  createdAt?: string | null;
}

/**
 * Xếp danh sách lệnh: việc cần làm ngay lên đầu, rồi tới việc đang chạy, cuối
 * cùng là việc đã đóng. Trong cùng nhóm thì mới nhất trước.
 */
export function sortMissionsForFieldForce<T extends SortableMission>(missions: T[]): T[] {
  const rank = (status: string): number => {
    if (fieldForceActionsFor(status).length > 0) return 0;
    return isMissionOpen(status) ? 1 : 2;
  };
  return [...missions].sort((left, right) => {
    const byRank = rank(left.status) - rank(right.status);
    if (byRank !== 0) return byRank;
    const leftAt = Date.parse(left.createdAt ?? "");
    const rightAt = Date.parse(right.createdAt ?? "");
    if (!Number.isFinite(leftAt) || !Number.isFinite(rightAt)) return 0;
    return rightAt - leftAt;
  });
}

export function missionStatusLabel(status: string): string {
  return MISSION_STATUS_LABEL[status] ?? status;
}
