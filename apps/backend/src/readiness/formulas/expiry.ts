import { ComponentScore, ExpiryInput, ExpiryThresholds } from "../readiness.types";

const MS_PER_MONTH = 30 * 24 * 60 * 60 * 1000;

/**
 * Điểm thời hạn sử dụng (thành phần "expiry", 15%).
 *
 * Phái sinh từ expiryDate vs now — KHÔNG lưu cứng trạng thái thời gian (#24),
 * nên không bao giờ lệch khi thời gian trôi.
 *
 * - Không có hạn dùng → coi như không ràng buộc thời hạn (100).
 * - Còn > longMonths → 100
 * - soonMonths..longMonths → 70
 * - 0..soonMonths → 40
 * - Đã hết hạn → 0
 */
export function scoreExpiry(input: ExpiryInput, thresholds: ExpiryThresholds): ComponentScore {
  const base: ComponentScore = { key: "expiry", score: 100, reasons: [] };

  if (input.expiryDate === null) {
    return base; // vật tư không có hạn dùng (vd xuồng, đèn)
  }

  const monthsLeft = (input.expiryDate.getTime() - input.now.getTime()) / MS_PER_MONTH;

  if (monthsLeft < 0) {
    return { key: "expiry", score: 0, reasons: ["Đã quá hạn sử dụng"] };
  }
  if (monthsLeft < thresholds.soonMonths) {
    return {
      key: "expiry",
      score: 40,
      reasons: [`Sắp hết hạn (còn ~${Math.floor(monthsLeft)} tháng)`],
    };
  }
  if (monthsLeft < thresholds.longMonths) {
    return {
      key: "expiry",
      score: 70,
      reasons: [`Hạn dùng còn dưới ${thresholds.longMonths} tháng`],
    };
  }
  return base;
}
