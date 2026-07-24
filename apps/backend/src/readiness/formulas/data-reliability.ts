import { ComponentScore, DataReliabilityInput } from "../readiness.types";
import { READINESS_CONFIG } from "../readiness.config";

type DataReliabilityConfig = typeof READINESS_CONFIG.dataReliability;

/**
 * Điểm độ tin cậy dữ liệu (thành phần "dataReliability", 10%).
 *
 * Kết hợp 2 yếu tố (trọng số nội bộ):
 *  - Độ mới kiểm kê: kiểm kê gần đây → tin cao; quá cũ / chưa kiểm kê → thấp.
 *  - Cảm biến còn sống: sensor không cập nhật > 30ph (sensorFresh=false) → không
 *    tin giá trị môi trường, hạ điểm (#25).
 */
export function scoreDataReliability(
  input: DataReliabilityInput,
  config: DataReliabilityConfig = READINESS_CONFIG.dataReliability,
): ComponentScore {
  const reasons: string[] = [];

  // Yếu tố 1: độ mới kiểm kê (0-100)
  let countScore: number;
  if (input.daysSinceLastCount === null) {
    countScore = config.neverCountedScore;
    reasons.push("Chưa từng kiểm kê thực tế");
  } else if (input.daysSinceLastCount <= config.freshCountDays) {
    countScore = 100;
  } else if (input.daysSinceLastCount >= config.staleCountDays) {
    countScore = 0;
    reasons.push(`Kiểm kê quá cũ (${input.daysSinceLastCount} ngày)`);
  } else {
    // Nội suy tuyến tính giữa fresh và stale.
    const span = config.staleCountDays - config.freshCountDays;
    const over = input.daysSinceLastCount - config.freshCountDays;
    countScore = Math.round(100 * (1 - over / span));
    reasons.push(`Kiểm kê cách đây ${input.daysSinceLastCount} ngày`);
  }

  // Yếu tố 2: cảm biến còn sống
  const sensorScore = input.sensorFresh ? 100 : 0;
  if (!input.sensorFresh) {
    reasons.push("Cảm biến môi trường không cập nhật gần đây");
  }

  const score = Math.round(countScore * config.countWeight + sensorScore * config.sensorWeight);

  return { key: "dataReliability", score, reasons };
}
