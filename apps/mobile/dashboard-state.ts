export type MobileTab =
  | "home"
  | "readiness"
  | "inventory"
  | "monthly-report"
  | "alerts"
  | "report";

export function tabsForRole(role: string): MobileTab[] {
  if (role === "REPORTER") return ["report", "alerts"];
  if (role === "WAREHOUSE" || role === "ADMIN") {
    return ["home", "readiness", "inventory", "monthly-report", "alerts"];
  }
  return ["home", "readiness", "inventory", "alerts"];
}

export interface InventorySummaryInput {
  quantity: number;
  condition: string;
  expiryDate: string | null;
  item: { sku: string };
}

export interface InventorySummary {
  batches: number;
  skus: number;
  quantity: number;
  damagedBatches: number;
  expiringSoonBatches: number;
}

const EXPIRY_WARNING_MS = 30 * 24 * 60 * 60 * 1000;

export function buildInventorySummary(
  batches: InventorySummaryInput[],
  now = new Date(),
): InventorySummary {
  const expiryLimit = now.getTime() + EXPIRY_WARNING_MS;
  return {
    batches: batches.length,
    skus: new Set(batches.map((batch) => batch.item.sku)).size,
    quantity: batches.reduce(
      (total, batch) => total + Math.max(0, batch.quantity),
      0,
    ),
    damagedBatches: batches.filter((batch) => batch.condition === "DAMAGED")
      .length,
    expiringSoonBatches: batches.filter((batch) => {
      if (!batch.expiryDate) return false;
      const expiry = Date.parse(batch.expiryDate);
      return Number.isFinite(expiry) && expiry >= now.getTime() && expiry <= expiryLimit;
    }).length,
  };
}
