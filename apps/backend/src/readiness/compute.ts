import { READINESS_WEIGHTS } from "@safestock/shared-types";
import { READINESS_CONFIG } from "./readiness.config";
import {
  combineComponents,
  scoreAccessibility,
  scoreCondition,
  scoreDataReliability,
  scoreEnvironment,
  scoreExpiry,
  scoreQuantity,
} from "./formulas";
import {
  BatchReadinessInput,
  ReadinessResult,
  WeightedReadiness,
} from "./readiness.types";

type Config = typeof READINESS_CONFIG;

/**
 * Tính điểm 1 lô từ input đã gom sẵn — hàm THUẦN (không DB, không side effect).
 * Chạy 6 công thức con → gộp có trọng số.
 */
export function computeBatchReadiness(
  input: BatchReadinessInput,
  config: Config = READINESS_CONFIG,
): WeightedReadiness {
  const components = [
    scoreQuantity(input.quantityAvailability),
    scoreCondition(input.condition, config.conditionScores),
    scoreExpiry(input.expiry, config.expiry),
    scoreAccessibility(input.accessibility, config.accessibilityPenaltyPerIssue),
    scoreEnvironment(input.environment, config.environment),
    scoreDataReliability(input.dataReliability, config.dataReliability),
  ];
  const combined = combineComponents(components, config.weights);
  return {
    score: combined.score,
    weight: input.quantity,
    components: combined.components,
  };
}

/**
 * Roll-up nhiều điểm con lên 1 cấp cao hơn (kệ/khu/kho).
 *
 * Điểm tổng = trung bình có trọng số theo quantity. Lô nhiều vật tư ảnh hưởng
 * điểm cấp trên nhiều hơn. Trọng số 0 (kho rỗng) → điểm 0.
 *
 * Breakdown cấp trên: mỗi thành phần cũng là trung bình trọng số của thành phần
 * cùng loại ở các con, gom lý do trừ điểm nổi bật.
 */
export function rollupReadiness(children: WeightedReadiness[]): ReadinessResult {
  const totalWeight = children.reduce((sum, child) => sum + child.weight, 0);

  if (totalWeight === 0 || children.length === 0) {
    return { score: 0, components: [] };
  }

  const weightedScore =
    children.reduce((sum, child) => sum + child.score * child.weight, 0) /
    totalWeight;

  // Gộp breakdown theo từng thành phần (trung bình trọng số + gom lý do).
  const componentKeys = Object.keys(READINESS_WEIGHTS) as Array<
    keyof typeof READINESS_WEIGHTS
  >;
  const components = componentKeys.map((key) => {
    let acc = 0;
    const reasons = new Set<string>();
    for (const child of children) {
      const comp = child.components.find((component) => component.key === key);
      if (!comp) continue;
      acc += comp.score * child.weight;
      comp.reasons.forEach((reason) => reasons.add(reason));
    }
    return {
      key,
      score: Math.round(acc / totalWeight),
      reasons: [...reasons],
    };
  });

  return { score: Math.round(weightedScore), components };
}
