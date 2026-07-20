/** Cảnh báo hết hạn (THUẦN, test được): batch sắp hết hạn trong X ngày tới. */

const EXPIRY_WARNING_DAYS = 30;

export interface BatchExpiry {
  batchId: string;
  sku: string;
  itemName: string;
  warehouseId: string;
  warehouseName: string;
  quantity: number;
  expiryDate: Date;
}

export interface ExpiryAlertResult extends BatchExpiry {
  daysUntilExpiry: number;
}

/** Lọc batch hết hạn trong `windowDays` tới (âm = đã hết hạn), sắp theo gần nhất trước. */
export function computeExpiryAlerts(
  batches: BatchExpiry[],
  now: Date,
  windowDays: number = EXPIRY_WARNING_DAYS,
): ExpiryAlertResult[] {
  return batches
    .map((b) => ({
      ...b,
      daysUntilExpiry: Math.floor((b.expiryDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)),
    }))
    .filter((b) => b.daysUntilExpiry <= windowDays)
    .sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);
}
