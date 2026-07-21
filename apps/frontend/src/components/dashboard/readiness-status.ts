export type ReadinessZone = "READY" | "ATTENTION" | "DEGRADED" | "CRITICAL";
export type OperationalStatus = "READY" | "NEEDS_ACTION" | "NOT_DISPATCHABLE";

export function getOperationalStatusLabel(status: OperationalStatus): string {
  return {
    READY: "Sẵn sàng điều phối",
    NEEDS_ACTION: "Cần xử lý",
    NOT_DISPATCHABLE: "Chưa thể điều phối",
  }[status];
}

export function getOperationalStatusColor(status: OperationalStatus): string {
  return {
    READY: "var(--color-ready)",
    NEEDS_ACTION: "var(--color-attention)",
    NOT_DISPATCHABLE: "var(--color-critical)",
  }[status];
}

export function getReadinessZone(score: number): ReadinessZone {
  if (score >= 80) return "READY";
  if (score >= 70) return "ATTENTION";
  if (score >= 50) return "DEGRADED";
  return "CRITICAL";
}

export function getZoneLabel(zone: ReadinessZone): string {
  return {
    READY: "Sẵn sàng",
    ATTENTION: "Cần chú ý",
    DEGRADED: "Suy giảm",
    CRITICAL: "Không đủ khả năng",
  }[zone];
}

export function getZoneColor(zone: ReadinessZone): string {
  return {
    READY: "var(--color-ready)",
    ATTENTION: "var(--color-attention)",
    DEGRADED: "var(--color-degraded)",
    CRITICAL: "var(--color-critical)",
  }[zone];
}

export function getComponentLabel(key: string): string {
  return {
    quantityAvailability: "Số lượng khả dụng",
    itemCondition: "Tình trạng vật tư",
    expiry: "Thời hạn",
    accessibility: "Tiếp cận",
    environment: "Môi trường",
    dataReliability: "Độ tin cậy dữ liệu",
  }[key] ?? key;
}
