import { ReadinessComponentKey } from "@safestock/shared-types";
import { ComponentScore } from "./readiness.types";

export type OperationalStatus = "READY" | "NEEDS_ACTION" | "NOT_DISPATCHABLE";

export interface ReadinessBlocker {
  code: "CRITICAL_FIRE_RISK" | "ACCESS_UNAVAILABLE" | "UNSAFE_ENVIRONMENT";
  title: string;
  reasons: string[];
  source: "INCIDENT" | "READINESS_DIMENSION";
}

export interface ReadinessDimension {
  key: ReadinessComponentKey;
  status: OperationalStatus;
  referenceScore: number;
  reasons: string[];
  recommendedAction: string | null;
}

export interface OperationalReadinessAssessment {
  operationalStatus: OperationalStatus;
  referenceScore: number;
  blockers: ReadinessBlocker[];
  dimensions: ReadinessDimension[];
  recommendedActions: string[];
}

export interface OperationalReadinessInput {
  referenceScore: number;
  components: ComponentScore[];
  openIncidents: {
    kind: string;
    severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    title: string;
  }[];
}

const HEALTHY_COMPONENT_SCORE = 80;

const ACTION_BY_COMPONENT: Record<ReadinessComponentKey, string> = {
  quantityAvailability: "Kiểm kê và bổ sung các vật tư đang thiếu.",
  itemCondition: "Kiểm tra, bảo trì hoặc thay thế vật tư không đạt.",
  expiry: "Ưu tiên sử dụng hoặc thay mới các lô gần hết hạn.",
  accessibility: "Mở khóa vị trí chứa vật tư hoặc cấp quyền truy cập phù hợp.",
  environment: "Đưa nhiệt độ và độ ẩm về ngưỡng bảo quản an toàn.",
  dataReliability: "Kiểm kê lại và xác nhận cảm biến đang cập nhật.",
};

/**
 * Biến score/bằng chứng thành kết luận vận hành. Điểm chỉ mô tả xu hướng;
 * blocker có quyền ưu tiên tuyệt đối và không bị điểm cao ghi đè.
 */
export function assessOperationalReadiness(
  input: OperationalReadinessInput,
): OperationalReadinessAssessment {
  const dimensions = input.components.map(toDimension);
  const blockers: ReadinessBlocker[] = [];

  const criticalFire = input.openIncidents.find(
    (incident) => incident.kind === "FIRE_RISK" && incident.severity === "CRITICAL",
  );
  if (criticalFire) {
    blockers.push({
      code: "CRITICAL_FIRE_RISK",
      title: "Nguy cơ cháy đang mở",
      reasons: [criticalFire.title],
      source: "INCIDENT",
    });
  }

  for (const dimension of dimensions) {
    if (dimension.status !== "NOT_DISPATCHABLE") continue;
    if (dimension.key === "accessibility") {
      blockers.push({
        code: "ACCESS_UNAVAILABLE",
        title: "Không thể tiếp cận vật tư trong kho",
        reasons: dimension.reasons,
        source: "READINESS_DIMENSION",
      });
    }
    if (dimension.key === "environment") {
      blockers.push({
        code: "UNSAFE_ENVIRONMENT",
        title: "Môi trường bảo quản không an toàn",
        reasons: dimension.reasons,
        source: "READINESS_DIMENSION",
      });
    }
  }

  const hasIncidentWarning = input.openIncidents.some(
    (incident) => incident.severity === "HIGH" || incident.severity === "CRITICAL",
  );
  const hasDimensionWarning = dimensions.some((item) => item.status !== "READY");
  const operationalStatus: OperationalStatus =
    blockers.length > 0
      ? "NOT_DISPATCHABLE"
      : hasIncidentWarning || hasDimensionWarning
        ? "NEEDS_ACTION"
        : "READY";

  return {
    operationalStatus,
    referenceScore: input.referenceScore,
    blockers,
    dimensions,
    recommendedActions: dimensions
      .map((item) => item.recommendedAction)
      .filter((action): action is string => Boolean(action)),
  };
}

function toDimension(component: ComponentScore): ReadinessDimension {
  const hardBlocked =
    component.score === 0 && (component.key === "accessibility" || component.key === "environment");
  const status: OperationalStatus = hardBlocked
    ? "NOT_DISPATCHABLE"
    : component.score < HEALTHY_COMPONENT_SCORE
      ? "NEEDS_ACTION"
      : "READY";

  return {
    key: component.key,
    status,
    referenceScore: component.score,
    reasons: component.reasons,
    recommendedAction: status === "READY" ? null : ACTION_BY_COMPONENT[component.key],
  };
}
