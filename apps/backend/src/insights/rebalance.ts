/** Đề xuất điều chuyển tồn kho (THUẦN, test được): kho thừa → kho thiếu, cùng SKU, cùng cụm xã. */

const IMBALANCE_RATIO_THRESHOLD = 2; // kho thừa gấp >= 2 lần trung bình cụm mới đề xuất chuyển

export interface WarehouseStock {
  warehouseId: string;
  warehouseName: string;
  sku: string;
  quantity: number;
}

export interface RebalanceSuggestion {
  sku: string;
  fromWarehouseId: string;
  fromWarehouseName: string;
  toWarehouseId: string;
  toWarehouseName: string;
  suggestedQty: number;
}

/**
 * So tồn cùng SKU giữa các kho (đã lọc sẵn cùng communeId ở service).
 * Kho có tồn >= ngưỡng lệch so trung bình cụm → nguồn "thừa"; kho dưới trung bình → "thiếu".
 * Phân bổ phần dư của mỗi kho thừa cho các kho thiếu theo ĐÚNG mức thiếu (thiếu nhiều nhận
 * trước), KHÔNG dồn hết vào 1 kho — tránh chuyển vượt nhu cầu kho nhận.
 */
export function computeRebalanceSuggestions(stocks: WarehouseStock[]): RebalanceSuggestion[] {
  const bySku = new Map<string, WarehouseStock[]>();
  for (const s of stocks) {
    const list = bySku.get(s.sku) ?? [];
    list.push(s);
    bySku.set(s.sku, list);
  }

  const suggestions: RebalanceSuggestion[] = [];
  for (const [sku, list] of bySku) {
    if (list.length < 2) continue; // chỉ 1 kho có SKU này → không có gì để cân bằng

    const total = list.reduce((sum, s) => sum + s.quantity, 0);
    const avg = total / list.length;
    if (avg === 0) continue;

    const surplus = list.filter((s) => s.quantity >= avg * IMBALANCE_RATIO_THRESHOLD);
    if (surplus.length === 0) continue;

    // Nhu cầu mỗi kho thiếu = phần dưới trung bình; thiếu nhiều nhận trước.
    const deficits = list
      .filter((s) => s.quantity < avg)
      .map((s) => ({ ...s, need: Math.floor(avg - s.quantity) }))
      .filter((s) => s.need > 0)
      .sort((a, b) => b.need - a.need);
    if (deficits.length === 0) continue;

    for (const from of surplus) {
      let movable = Math.floor((from.quantity - avg) / 2); // chuyển tối đa nửa phần dư (giữ đệm)
      for (const to of deficits) {
        if (movable <= 0) break;
        if (to.warehouseId === from.warehouseId || to.need <= 0) continue;
        const qty = Math.min(movable, to.need);
        if (qty <= 0) continue;
        suggestions.push({
          sku,
          fromWarehouseId: from.warehouseId,
          fromWarehouseName: from.warehouseName,
          toWarehouseId: to.warehouseId,
          toWarehouseName: to.warehouseName,
          suggestedQty: qty,
        });
        movable -= qty;
        to.need -= qty;
      }
    }
  }
  return suggestions;
}
