import { ComponentScore, ConditionInput } from "../readiness.types";
import { READINESS_CONFIG } from "../readiness.config";

const REASON: Record<ConditionInput["condition"], string | null> = {
  NEW: null,
  USED: "Vật tư đã qua sử dụng",
  NEEDS_CHECK: "Vật tư cần kiểm tra lại",
  DAMAGED: "Vật tư hư hỏng",
};

/**
 * Điểm tình trạng vật lý (thành phần "itemCondition", 22%).
 *
 * Lưu ý: đây là CHIỀU TÌNH TRẠNG (NEW/USED/NEEDS_CHECK/DAMAGED). Chiều lưu hành
 * (IN_STOCK/ON_LOAN) xử lý ở công thức khả dụng số lượng, KHÔNG ở đây.
 */
export function scoreCondition(
  input: ConditionInput,
  scores: typeof READINESS_CONFIG.conditionScores = READINESS_CONFIG.conditionScores,
): ComponentScore {
  const score = scores[input.condition];
  const reason = REASON[input.condition];
  return {
    key: "itemCondition",
    score,
    reasons: reason ? [reason] : [],
  };
}
