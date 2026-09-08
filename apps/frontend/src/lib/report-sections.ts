/**
 * Các phần trong tab "Báo cáo".
 *
 * Tách khỏi component vì đây là phần duy nhất trong tab có luật thật: phần nào
 * hiện ra phụ thuộc vai người dùng. Để luật đó nằm lẫn trong JSX thì mỗi lần
 * thêm một phần mới lại phải dò lại toàn bộ cây render mới biết ai thấy gì.
 * Cùng quy ước với `warehouseSectionsForRole` của ứng dụng di động.
 */
export type ReportSection = "monthly" | "disaster";

export const REPORT_SECTION_LABELS: Readonly<Record<ReportSection, string>> = {
  monthly: "Báo cáo tháng",
  disaster: "Thống kê sau thiên tai",
};

export const REPORT_SECTION_DESCRIPTIONS: Readonly<Record<ReportSection, string>> = {
  monthly: "Kiểm kê định kỳ của từng thôn, chờ xã duyệt để cập nhật tồn kho.",
  disaster: "Mỗi đợt thiên tai đã dùng hết bao nhiêu, mất bao nhiêu và thu hồi bao nhiêu.",
};

/**
 * Thứ tự hiển thị của các phần. Báo cáo tháng đứng trước vì đó là việc làm hằng
 * tháng, còn thống kê sau thiên tai chỉ được mở ra sau mỗi đợt.
 */
export const REPORT_SECTIONS: ReportSection[] = ["monthly", "disaster"];
