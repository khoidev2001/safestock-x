import { AccessibilityInput, ComponentScore } from "../readiness.types";

/**
 * Điểm khả năng tiếp cận (thành phần "accessibility", 15%).
 *
 * Đúng vị trí + không bị chặn + không bị khóa = 100.
 * Mỗi vi phạm (lối đi bị chặn / kệ bị khóa) trừ penaltyPerIssue.
 */
export function scoreAccessibility(
  input: AccessibilityInput,
  penaltyPerIssue: number,
): ComponentScore {
  const reasons: string[] = [];
  let score = 100;

  if (input.isBlocked) {
    score -= penaltyPerIssue;
    reasons.push("Lối đi tới kệ bị chặn");
  }
  if (input.isLocked) {
    score -= penaltyPerIssue;
    reasons.push("Kệ bị khóa hoặc thiếu quyền truy cập");
  }

  return {
    key: "accessibility",
    score: Math.max(0, score),
    reasons,
  };
}
