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

/**
 * MỘT NHIỆM VỤ trong một đợt.
 *
 * Một cơn bão sinh ra nhiều nhiệm vụ; đây là một trong số đó, giữ nguyên bộ cột
 * của đợt để mở ra đối chiếu "việc nào tiêu gì".
 */
export interface DisasterStatisticsMission {
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

/**
 * MỘT ĐỢT THIÊN TAI — một cơn bão, một trận lũ, không phải một nhiệm vụ.
 *
 * Máy chủ gộp các nhiệm vụ nối tiếp nhau thành đợt: còn nhiệm vụ mới trong vòng
 * `episodeGapDays` ngày thì thiên tai còn đang diễn ra, im lặng đủ lâu thì đợt
 * khép lại. Câu hỏi mang tới báo cáo này luôn là "cơn bão vừa rồi xã tiêu hết bao
 * nhiêu", nên đợt mới là đơn vị để cộng số.
 */
export interface DisasterStatisticsEvent {
  episodeId: string;
  /** Các loại tình huống trong đợt, loại có nhiều nhiệm vụ nhất đứng đầu. */
  incidentTypes: string[];
  missionCount: number;
  /** Số người ảnh hưởng lớn nhất ghi nhận trong đợt. */
  peakAffectedPeople: number;
  /** Mốc lập nhiệm vụ đầu tiên của đợt. */
  startedAt: string;
  /** Mốc lập nhiệm vụ gần nhất — chỗ bắt đầu đếm những ngày im lặng. */
  lastMissionAt: string;
  /** Mốc mới nhất có thao tác thật (xuất kho, ký nhận, hoàn trả) trong đợt. */
  lastActivityAt: string;
  /** Đợt còn có thể nhận thêm nhiệm vụ — số liệu của nó CÒN ĐỔI. */
  ongoing: boolean;
  warehouses: { id: string; name: string }[];
  categories: DisasterCategoryTotals[];
  totals: DisasterQuantityTotals;
  missions: DisasterStatisticsMission[];
}

export interface DisasterStatisticsResponse {
  /** Thời điểm máy chủ chốt số của chính lần gọi này. */
  generatedAt: string;
  /** Bao nhiêu ngày không có nhiệm vụ mới thì một đợt được coi là đã khép lại. */
  episodeGapDays: number;
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
