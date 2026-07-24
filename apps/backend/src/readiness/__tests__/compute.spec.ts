import { computeBatchReadiness, rollupReadiness } from "../compute";
import { BatchReadinessInput, WeightedReadiness } from "../readiness.types";

const NOW = new Date("2026-07-15T00:00:00+07:00");

/** Lô hoàn hảo: mới, còn hạn dài, đúng vị trí, kiểm kê khớp, môi trường tốt. */
const perfectBatch = (overrides: Partial<BatchReadinessInput> = {}): BatchReadinessInput => ({
  batchId: "b1",
  quantity: 100,
  expiry: { expiryDate: null, now: NOW },
  condition: { condition: "NEW" },
  accessibility: { isLocked: false },
  quantityAvailability: { systemQty: 100, countedQty: 100, onLoanQty: 0 },
  environment: { temperature: 28, humidity: 60 },
  dataReliability: { daysSinceLastCount: 3, sensorFresh: true },
  ...overrides,
});

describe("computeBatchReadiness", () => {
  it("should return 100 for a perfect batch", () => {
    const result = computeBatchReadiness(perfectBatch());
    expect(result.score).toBe(100);
    expect(result.weight).toBe(100);
    expect(result.components).toHaveLength(6);
  });

  it("should drop score when item is damaged", () => {
    const result = computeBatchReadiness(perfectBatch({ condition: { condition: "DAMAGED" } }));
    // condition 22% về 0 → 100 - 22 = 78
    expect(result.score).toBe(78);
  });

  it("should carry quantity as rollup weight", () => {
    const result = computeBatchReadiness(perfectBatch({ quantity: 42 }));
    expect(result.weight).toBe(42);
  });
});

describe("rollupReadiness", () => {
  const child = (score: number, weight: number): WeightedReadiness => ({
    score,
    weight,
    components: [
      { key: "quantityAvailability", score, reasons: score < 100 ? ["thiếu"] : [] },
      { key: "itemCondition", score: 100, reasons: [] },
      { key: "expiry", score: 100, reasons: [] },
      { key: "accessibility", score: 100, reasons: [] },
      { key: "environment", score: 100, reasons: [] },
      { key: "dataReliability", score: 100, reasons: [] },
    ],
  });

  it("should return 0 when total weight is 0", () => {
    expect(rollupReadiness([child(100, 0)]).score).toBe(0);
  });

  it("should return 0 for empty children", () => {
    expect(rollupReadiness([]).score).toBe(0);
  });

  it("should weight by quantity, not simple average", () => {
    // 90 điểm với 100 vật tư + 50 điểm với 10 vật tư → nghiêng về 90.
    const result = rollupReadiness([child(90, 100), child(50, 10)]);
    // (90*100 + 50*10) / 110 = 86.36 → 86
    expect(result.score).toBe(86);
  });

  it("should aggregate breakdown per component", () => {
    const result = rollupReadiness([child(80, 50), child(100, 50)]);
    const quantity = result.components.find((c) => c.key === "quantityAvailability");
    expect(quantity?.score).toBe(90); // (80*50 + 100*50)/100
    expect(quantity?.reasons).toContain("thiếu");
  });

  it("should preserve all 6 component keys in rollup", () => {
    const result = rollupReadiness([child(100, 10)]);
    expect(result.components).toHaveLength(6);
  });
});
