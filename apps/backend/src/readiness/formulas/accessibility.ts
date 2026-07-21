import { AccessibilityInput, ComponentScore } from "../readiness.types";

/**
 * Điểm khả năng tiếp cận (thành phần "accessibility", 15%).
 *
 * Kệ không bị khóa = 100. Kệ bị khóa hoặc thiếu quyền bị trừ điểm.
 */
export function scoreAccessibility(
  input: AccessibilityInput,
  penaltyPerIssue: number,
): ComponentScore {
  const reasons: string[] = [];
  let score = 100;

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
