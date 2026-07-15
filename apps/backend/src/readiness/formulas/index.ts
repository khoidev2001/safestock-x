import { READINESS_WEIGHTS } from "@safestock/shared-types";
import { ComponentScore, ReadinessResult } from "../readiness.types";

export { scoreExpiry } from "./expiry";
export { scoreCondition } from "./condition";
export { scoreAccessibility } from "./accessibility";
export { scoreQuantity } from "./quantity";
export { scoreEnvironment } from "./environment";
export { scoreDataReliability } from "./data-reliability";

type Weights = typeof READINESS_WEIGHTS;

/**
 * Gộp 6 điểm thành phần (mỗi cái đã chuẩn hóa 0-100) thành điểm tổng có trọng số.
 *
 * Gộp được vì mọi thành phần đã chuẩn hóa cùng thang 0-100 — KHÔNG cộng đơn vị
 * thô (lít + chiếc). Xử lý đơn vị hỗn hợp nằm ở tầng roll-up (C1), không ở đây.
 */
export function combineComponents(
  components: ComponentScore[],
  weights: Weights = READINESS_WEIGHTS,
): ReadinessResult {
  let total = 0;
  for (const component of components) {
    total += component.score * weights[component.key];
  }
  return {
    score: Math.round(total),
    components,
  };
}
