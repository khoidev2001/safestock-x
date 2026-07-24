import { computeTrends, ExportTxnTrend } from "../trends";

const NOW = new Date("2026-07-17T00:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);

describe("computeTrends", () => {
  it("tính % tăng đúng giữa kỳ này và kỳ trước", () => {
    const exports: ExportTxnTrend[] = [
      { sku: "A", itemName: "Item A", quantity: 20, createdAt: daysAgo(5) }, // kỳ này
      { sku: "A", itemName: "Item A", quantity: 10, createdAt: daysAgo(15) }, // kỳ trước
    ];
    const result = computeTrends(exports, 10, NOW);
    const a = result.find((r) => r.sku === "A")!;
    expect(a.currentTotal).toBe(20);
    expect(a.previousTotal).toBe(10);
    expect(a.changePercent).toBe(100);
  });

  it("previousTotal=0 & currentTotal>0 → changePercent null", () => {
    const exports: ExportTxnTrend[] = [
      { sku: "A", itemName: "Item A", quantity: 5, createdAt: daysAgo(1) },
    ];
    const result = computeTrends(exports, 10, NOW);
    expect(result[0].changePercent).toBeNull();
  });

  it("bỏ qua giao dịch ngoài 2 kỳ", () => {
    const exports: ExportTxnTrend[] = [
      { sku: "A", itemName: "Item A", quantity: 999, createdAt: daysAgo(100) },
    ];
    const result = computeTrends(exports, 10, NOW);
    expect(result).toEqual([]);
  });
});
