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
  // Tên hàng gom riêng từ CẢ HAI kỳ. Mặt hàng kỳ trước có mà kỳ này bằng 0 thì
  // map `current` không có entry — lấy tên theo kỳ này sẽ rơi về mã kho, và
  // người đọc nhận được "BATT-01" thay vì "Bộ pin" đúng ở dòng đáng chú ý nhất.
  const itemNames = new Map<string, string>();

  for (const t of exports) {
    const ts = t.createdAt.getTime();
    if (ts >= previousStart && ts < now.getTime()) {
      itemNames.set(t.sku, t.itemName);
    }
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
    const itemName = current.get(sku)?.itemName ?? itemNames.get(sku) ?? sku;
    const changePercent =
      previousTotal > 0 ? ((currentTotal - previousTotal) / previousTotal) * 100 : null;
    return { sku, itemName, currentTotal, previousTotal, changePercent };
  });
}
