import { Allocation, overallFulfillment } from "./mission.compute";

export type MissionReadinessStatus = "READY" | "NEEDS_ACTION" | "NOT_DISPATCHABLE";

export interface MissionItemReadiness {
  sku: string;
  itemName: string;
  required: number;
  allocated: number;
  shortage: number;
  fulfillment: number;
  status: MissionReadinessStatus;
}

export interface MissionReadinessBlocker {
  sku: string;
  itemName: string;
  reasons: string[];
}

export interface MissionReadinessAssessment {
  status: MissionReadinessStatus;
  fulfillment: number;
  items: MissionItemReadiness[];
  blockers: MissionReadinessBlocker[];
  recommendedActions: string[];
}

/** Đánh giá khả năng đáp ứng theo nhiệm vụ; loại yếu nhất quyết định kết quả. */
export function assessMissionReadiness(
  allocations: Allocation[],
  unavailableReasonsBySku: Map<string, string[]> = new Map(),
): MissionReadinessAssessment {
  const items = allocations.map((allocation): MissionItemReadiness => {
    const fulfillment =
      allocation.required > 0
        ? Math.round((allocation.allocated / allocation.required) * 100)
        : 100;
    const status: MissionReadinessStatus =
      fulfillment === 100
        ? "READY"
        : allocation.allocated === 0
          ? "NOT_DISPATCHABLE"
          : "NEEDS_ACTION";
    return {
      sku: allocation.sku,
      itemName: allocation.itemName,
      required: allocation.required,
      allocated: allocation.allocated,
      shortage: allocation.shortage,
      fulfillment,
      status,
    };
  });

  const blockers = items
    .filter((item) => item.status === "NOT_DISPATCHABLE")
    .map((item) => ({
      sku: item.sku,
      itemName: item.itemName,
      reasons: unavailableReasonsBySku.get(item.sku) ?? [
        "Không có lô vật tư đủ điều kiện để cấp phát.",
      ],
    }));
  const hasShortage = items.some((item) => item.status === "NEEDS_ACTION");
  const status: MissionReadinessStatus =
    blockers.length > 0 ? "NOT_DISPATCHABLE" : hasShortage ? "NEEDS_ACTION" : "READY";

  return {
    status,
    fulfillment: overallFulfillment(allocations),
    items,
    blockers,
    recommendedActions: items
      .filter((item) => item.shortage > 0)
      .map((item) => `Bổ sung ${item.shortage} ${item.itemName} từ kho hoặc nguồn khác.`),
  };
}
