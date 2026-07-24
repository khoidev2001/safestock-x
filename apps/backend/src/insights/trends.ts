/** Xu hướng xuất kho (THUẦN, test được): % tăng/giảm kỳ này so kỳ trước, theo SKU. */

export interface ExportTxnTrend {
  sku: string;
  itemName: string;
  quantity: number;
  createdAt: Date;
}

export interface TrendResult {
  sku: string;
  itemName: string;
  currentTotal: number;
  previousTotal: number;
  changePercent: number | null;
}

/**
 * So tổng xuất `periodDays` gần nhất với `periodDays` liền trước đó, theo SKU.
 * previousTotal=0 & currentTotal>0 → changePercent null (không chia 0, coi là "mới xuất hiện").
 */
export function computeTrends(
  exports: ExportTxnTrend[],
  periodDays: number,
  now: Date,
): TrendResult[] {
  const msPerDay = 24 * 60 * 60 * 1000;
  const currentStart = now.getTime() - periodDays * msPerDay;
  const previousStart = currentStart - periodDays * msPerDay;

  const current = new Map<string, { itemName: string; total: number }>();
  const previous = new Map<string, number>();

  for (const t of exports) {
    const ts = t.createdAt.getTime();
    if (ts >= currentStart && ts < now.getTime()) {
      const entry = current.get(t.sku) ?? { itemName: t.itemName, total: 0 };
      entry.total += t.quantity;
      current.set(t.sku, entry);
    } else if (ts >= previousStart && ts < currentStart) {
      previous.set(t.sku, (previous.get(t.sku) ?? 0) + t.quantity);
    }
  }

  const skus = new Set([...current.keys(), ...previous.keys()]);
  return [...skus].map((sku) => {
    const currentTotal = current.get(sku)?.total ?? 0;
    const previousTotal = previous.get(sku) ?? 0;
    const itemName = current.get(sku)?.itemName ?? sku;
    const changePercent =
      previousTotal > 0 ? ((currentTotal - previousTotal) / previousTotal) * 100 : null;
    return { sku, itemName, currentTotal, previousTotal, changePercent };
  });
}
