export type ReadinessZone = "READY" | "ATTENTION" | "DEGRADED" | "CRITICAL";

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
