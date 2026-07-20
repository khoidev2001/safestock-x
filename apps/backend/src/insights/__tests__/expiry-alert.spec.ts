import { computeExpiryAlerts, BatchExpiry } from "../expiry-alert";

const NOW = new Date("2026-07-17T00:00:00Z");
const daysFromNow = (n: number) => new Date(NOW.getTime() + n * 24 * 60 * 60 * 1000);

const batch = (overrides: Partial<BatchExpiry>): BatchExpiry => ({
  batchId: "b1",
  sku: "A",
  itemName: "Item A",
  warehouseId: "w1",
  warehouseName: "Kho 1",
  quantity: 10,
  expiryDate: daysFromNow(10),
  ...overrides,
});

describe("computeExpiryAlerts", () => {
  it("lọc batch trong windowDays tới, sắp gần nhất trước", () => {
    const batches = [
      batch({ batchId: "far", expiryDate: daysFromNow(25) }),
      batch({ batchId: "near", expiryDate: daysFromNow(5) }),
      batch({ batchId: "outside", expiryDate: daysFromNow(40) }),
    ];
    const result = computeExpiryAlerts(batches, NOW, 30);
    expect(result.map((r) => r.batchId)).toEqual(["near", "far"]);
  });

  it("bao gồm batch đã hết hạn (daysUntilExpiry âm)", () => {
    const batches = [batch({ batchId: "expired", expiryDate: daysFromNow(-2) })];
    const result = computeExpiryAlerts(batches, NOW, 30);
    expect(result[0].daysUntilExpiry).toBe(-2);
  });

  it("mảng rỗng khi không có batch nào sắp hết hạn", () => {
    const batches = [batch({ expiryDate: daysFromNow(100) })];
    expect(computeExpiryAlerts(batches, NOW, 30)).toEqual([]);
  });
});
