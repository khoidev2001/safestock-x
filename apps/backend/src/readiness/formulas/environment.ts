import {
  ComponentScore,
  EnvironmentInput,
  EnvironmentThresholds,
} from "../readiness.types";

/**
 * Điểm điều kiện môi trường (thành phần "environment", 10%).
 *
 * Nhiệt độ / độ ẩm trong ngưỡng = 100. Vượt ngưỡng → giảm tuyến tính theo mức
 * vượt (mỗi 10% vượt ngưỡng trừ ~20 điểm), sàn 0. Lấy mức thấp hơn giữa 2 yếu tố
 * (mắt xích yếu nhất — độ ẩm cao vẫn hại dù nhiệt độ ổn).
 *
 * Thiếu dữ liệu cảm biến (null) → coi trung tính (100) ở đây; việc cảm biến chết
 * được phạt riêng ở thành phần độ tin cậy dữ liệu (#25).
 */
export function scoreEnvironment(
  input: EnvironmentInput,
  thresholds: EnvironmentThresholds,
): ComponentScore {
  const reasons: string[] = [];
  const scores: number[] = [];

  if (input.temperature !== null && input.temperature > thresholds.maxTemperature) {
    const overRatio =
      (input.temperature - thresholds.maxTemperature) / thresholds.maxTemperature;
    scores.push(Math.max(0, 100 - overRatio * 200));
    reasons.push(
      `Nhiệt độ ${input.temperature}°C vượt ngưỡng ${thresholds.maxTemperature}°C`,
    );
  }

  if (input.humidity !== null && input.humidity > thresholds.maxHumidity) {
    const overRatio =
      (input.humidity - thresholds.maxHumidity) / thresholds.maxHumidity;
    scores.push(Math.max(0, 100 - overRatio * 200));
    reasons.push(
      `Độ ẩm ${input.humidity}% vượt ngưỡng ${thresholds.maxHumidity}%`,
    );
  }

  const score = scores.length > 0 ? Math.round(Math.min(...scores)) : 100;
  return { key: "environment", score, reasons };
}
