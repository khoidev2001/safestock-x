/** Dự báo cạn kho (THUẦN, test được): tốc độ xuất TB/ngày → còn bao nhiêu ngày. */

const LOW_STOCK_DAYS_THRESHOLD = 7;

export interface ExportTxn {
  sku: string;
  itemName: string;
  quantity: number;
  createdAt: Date;
}

export interface StockLevel {
  sku: string;
  itemName: string;
  quantity: number;
}

export interface ForecastResult {
  sku: string;
  itemName: string;
  quantity: number;
  avgPerDay: number;
  daysLeft: number | null;
  lowStock: boolean;
}

/**
 * Tốc độ xuất TB/ngày mỗi SKU trong `windowDays` gần nhất → dự báo số ngày còn lại.
 * SKU chưa xuất lần nào (avgPerDay=0) → daysLeft null (không suy được), không lowStock.
 * SKU CÓ lịch sử xuất nhưng tồn khả dụng = 0 (đã cạn sạch, không còn batch trong `stock`)
 * → vẫn đưa vào kết quả với daysLeft=0, lowStock=true — đây là thứ cần báo gấp nhất.
 */
export function computeForecast(
  exports: ExportTxn[],
  stock: StockLevel[],
  windowDays: number,
  now: Date,
): ForecastResult[] {
  const cutoff = now.getTime() - windowDays * 24 * 60 * 60 * 1000;
  const totalBySku = new Map<string, number>();
  const nameBySku = new Map<string, string>();
  for (const t of exports) {
    if (t.createdAt.getTime() < cutoff) continue;
    totalBySku.set(t.sku, (totalBySku.get(t.sku) ?? 0) + t.quantity);
    nameBySku.set(t.sku, t.itemName);
  }

  const stockBySku = new Map(stock.map((s) => [s.sku, s]));
  const skus = new Set<string>([...stockBySku.keys(), ...totalBySku.keys()]);

  return [...skus].map((sku) => {
    const s = stockBySku.get(sku);
    const quantity = s?.quantity ?? 0;
    const itemName = s?.itemName ?? nameBySku.get(sku) ?? sku;
    const avgPerDay = (totalBySku.get(sku) ?? 0) / windowDays;
    const daysLeft = avgPerDay > 0 ? quantity / avgPerDay : null;
    return {
      sku,
      itemName,
      quantity,
      avgPerDay,
      daysLeft,
      lowStock: daysLeft != null && daysLeft < LOW_STOCK_DAYS_THRESHOLD,
    };
  });
}
