import { apiFetch } from "./api";

/**
 * Thống kê sau thiên tai. Mọi con số dưới đây do máy chủ cộng từ sổ nghiệp vụ;
 * màn hình chỉ hiển thị lại, không tự tính thêm và không tự suy diễn.
 */

/** Các cột số dùng chung cho cả nhóm hàng, từng mã hàng và dòng tổng. */
export interface DisasterQuantityTotals {
  /** Số cần theo phương án. */
  requested: number;
  /** Số kho đã thật sự xuất — tồn kho đã bị trừ ở bước này. */
  issued: number;
  /** Số đội cứu hộ đã ký nhận khi tới lấy. */
  pickedUp: number;
  /**
   * Chênh lệch giữa số đã xuất và số đã ký nhận.
   *
   * KHÔNG phải thất thoát: có thể do xe không chở hết, chuyến sau lấy nốt. Đây
   * là lý do cột này tách riêng khỏi `lost`.
   */
  pickupGap: number;
  loanedOut: number;
  returnedOk: number;
  returnedDamaged: number;
  /** Đã ghi nhận mất trên phiếu mượn — đây mới là thất thoát thật. */
  lost: number;
  stillOnLoan: number;
}

export interface DisasterItemTotals extends DisasterQuantityTotals {
  sku: string;
  itemName: string;
  unit: string;
  /** true = hàng tiêu hao (nước, lương thực); false = hàng tái sử dụng, phải thu về. */
  consumable: boolean;
}

export interface DisasterCategoryTotals extends DisasterQuantityTotals {
  categoryName: string;
  unit: string;
  consumable: boolean;
  items: DisasterItemTotals[];
}

export interface DisasterStatisticsEvent {
  missionId: string;
  missionNo: number;
  incidentType: string;
  location: string | null;
  hamletName: string | null;
  status: string;
  affectedPeople: number;
  durationHours: number;
  deliveryOutcome: string | null;
  deliveryNote: string | null;
  /** Thời điểm ghi nhận tình huống — mốc bắt đầu của đợt. */
  startedAt: string;
  approvedAt: string | null;
  completedAt: string | null;
  /** Mốc mới nhất có thao tác thật trên đợt này. */
  lastActivityAt: string;
  warehouses: { id: string; name: string }[];
  categories: DisasterCategoryTotals[];
  totals: DisasterQuantityTotals;
}

export interface DisasterStatisticsResponse {
  /** Thời điểm máy chủ chốt số của chính lần gọi này. */
  generatedAt: string;
  events: DisasterStatisticsEvent[];
  totals: DisasterQuantityTotals;
}

export function getDisasterStatistics(range?: {
  from?: string;
  to?: string;
}): Promise<DisasterStatisticsResponse> {
  const params = new URLSearchParams();
  if (range?.from) params.set("from", range.from);
  if (range?.to) params.set("to", range.to);
  const query = params.toString();
  return apiFetch<DisasterStatisticsResponse>(
    `/api/reports/disaster-statistics${query ? `?${query}` : ""}`,
  );
}
