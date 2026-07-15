import { READINESS_WEIGHTS } from "@safestock/shared-types";
import {
  EnvironmentThresholds,
  ExpiryThresholds,
} from "./readiness.types";

/**
 * Cấu hình Readiness Score.
 *
 * ⚠️ CÁC CON SỐ DƯỚI ĐÂY LÀ ĐỊNH MỨC THAM KHẢO PHỤC VỤ NGHIÊN CỨU, không phải
 * hướng dẫn nghiệp vụ chính thức. Được thiết kế để quản lý kho tinh chỉnh theo
 * đặc thù từng kho (sẽ đọc từ bảng ReadinessRule trong DB ở lát tích hợp).
 *
 * Trọng số nguồn: packages/shared-types READINESS_WEIGHTS (28/22/15/15/10/10, tổng = 1).
 */
export const READINESS_CONFIG = {
  weights: READINESS_WEIGHTS,

  expiry: {
    longMonths: 6, // còn > 6 tháng = 100
    soonMonths: 2, // 2..6 tháng = 70; < 2 tháng = 40; hết hạn = 0
  } as ExpiryThresholds,

  /** Điểm theo tình trạng vật lý (NEW tốt nhất, DAMAGED = 0). */
  conditionScores: {
    NEW: 100,
    USED: 75,
    NEEDS_CHECK: 50,
    DAMAGED: 0,
  } as const,

  /** Mỗi vi phạm tiếp cận trừ điểm này (isBlocked, isLocked). */
  accessibilityPenaltyPerIssue: 50,

  environment: {
    maxTemperature: 35, // °C — vượt là môi trường xấu
    maxHumidity: 80, // %
  } as EnvironmentThresholds,

  dataReliability: {
    /** Kiểm kê trong ngưỡng này = tin đầy đủ (100 phần "độ mới kiểm kê"). */
    freshCountDays: 7,
    /** Quá ngưỡng này coi như dữ liệu kiểm kê cũ (điểm độ mới = 0). */
    staleCountDays: 90,
    /** Trừ khi chưa kiểm kê bao giờ. */
    neverCountedScore: 30,
    /** Trọng số nội bộ: độ mới kiểm kê vs cảm biến còn sống (tổng = 1). */
    countWeight: 0.6,
    sensorWeight: 0.4,
  },
} as const;

export type ReadinessConfig = typeof READINESS_CONFIG;
