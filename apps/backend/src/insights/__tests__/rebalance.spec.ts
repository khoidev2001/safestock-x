import { computeRebalanceSuggestions, WarehouseStock } from "../rebalance";

describe("computeRebalanceSuggestions", () => {
  it("đề xuất chuyển từ kho thừa sang kho thiếu nhất cùng SKU", () => {
    const stocks: WarehouseStock[] = [
      { warehouseId: "w1", warehouseName: "Kho 1", sku: "A", quantity: 100 },
      { warehouseId: "w2", warehouseName: "Kho 2", sku: "A", quantity: 0 },
    ];
    const result = computeRebalanceSuggestions(stocks);
    expect(result).toHaveLength(1);
    expect(result[0].fromWarehouseId).toBe("w1");
    expect(result[0].toWarehouseId).toBe("w2");
    expect(result[0].suggestedQty).toBeGreaterThan(0);
  });

  it("không đề xuất khi chỉ 1 kho có SKU", () => {
    const stocks: WarehouseStock[] = [
      { warehouseId: "w1", warehouseName: "Kho 1", sku: "A", quantity: 100 },
    ];
    expect(computeRebalanceSuggestions(stocks)).toEqual([]);
  });

  it("không đề xuất khi tồn đã cân bằng (lệch dưới ngưỡng)", () => {
    const stocks: WarehouseStock[] = [
      { warehouseId: "w1", warehouseName: "Kho 1", sku: "A", quantity: 55 },
      { warehouseId: "w2", warehouseName: "Kho 2", sku: "A", quantity: 45 },
    ];
    expect(computeRebalanceSuggestions(stocks)).toEqual([]);
  });

  it("phân bổ cho nhiều kho thiếu theo mức thiếu, không dồn 1 kho", () => {
    // avg = (120+0+0)/3 = 40. Kho 1 thừa (>=80). movable = (120-40)/2 = 40.
    // 2 kho thiếu, mỗi kho need = 40 → nhận đến khi hết movable.
    const stocks: WarehouseStock[] = [
      { warehouseId: "w1", warehouseName: "Kho 1", sku: "A", quantity: 120 },
      { warehouseId: "w2", warehouseName: "Kho 2", sku: "A", quantity: 0 },
      { warehouseId: "w3", warehouseName: "Kho 3", sku: "A", quantity: 0 },
    ];
    const result = computeRebalanceSuggestions(stocks);
    const totalMoved = result.reduce((s, r) => s + r.suggestedQty, 0);
    expect(totalMoved).toBeLessThanOrEqual(40); // không vượt phần movable
    expect(result.every((r) => r.fromWarehouseId === "w1")).toBe(true);
    // không đề xuất nào vượt nhu cầu 1 kho nhận (need=40)
    expect(result.every((r) => r.suggestedQty <= 40)).toBe(true);
  });

  it("bỏ qua SKU có trung bình 0 (tất cả kho đều hết)", () => {
    const stocks: WarehouseStock[] = [
      { warehouseId: "w1", warehouseName: "Kho 1", sku: "A", quantity: 0 },
      { warehouseId: "w2", warehouseName: "Kho 2", sku: "A", quantity: 0 },
    ];
    expect(computeRebalanceSuggestions(stocks)).toEqual([]);
  });
});
