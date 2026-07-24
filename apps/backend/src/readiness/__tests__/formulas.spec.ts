import { READINESS_CONFIG } from "../readiness.config";
import {
  combineComponents,
  scoreAccessibility,
  scoreCondition,
  scoreDataReliability,
  scoreEnvironment,
  scoreExpiry,
  scoreQuantity,
} from "../formulas";
import { ComponentScore } from "../readiness.types";

const NOW = new Date("2026-07-15T00:00:00+07:00");
const monthsFromNow = (m: number) => new Date(NOW.getTime() + m * 30 * 24 * 60 * 60 * 1000);

describe("scoreExpiry", () => {
  const t = READINESS_CONFIG.expiry;

  it("should return 100 when item has no expiry date", () => {
    expect(scoreExpiry({ expiryDate: null, now: NOW }, t).score).toBe(100);
  });

  it("should return 100 when expiry is far in the future", () => {
    expect(scoreExpiry({ expiryDate: monthsFromNow(12), now: NOW }, t).score).toBe(100);
  });

  it("should return 70 when expiry is between soon and long threshold", () => {
    expect(scoreExpiry({ expiryDate: monthsFromNow(4), now: NOW }, t).score).toBe(70);
  });

  it("should return 40 when expiry is within soon threshold", () => {
    const result = scoreExpiry({ expiryDate: monthsFromNow(1), now: NOW }, t);
    expect(result.score).toBe(40);
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  it("should return 0 when item is already expired", () => {
    const result = scoreExpiry({ expiryDate: monthsFromNow(-1), now: NOW }, t);
    expect(result.score).toBe(0);
    expect(result.reasons).toContain("Đã quá hạn sử dụng");
  });
});

describe("scoreCondition", () => {
  it("should return 100 with no reason for NEW", () => {
    const result = scoreCondition({ condition: "NEW" });
    expect(result.score).toBe(100);
    expect(result.reasons).toHaveLength(0);
  });

  it("should return 75 with reason for USED", () => {
    const result = scoreCondition({ condition: "USED" });
    expect(result.score).toBe(75);
    expect(result.reasons).toHaveLength(1);
  });

  it("should return 0 for DAMAGED", () => {
    expect(scoreCondition({ condition: "DAMAGED" }).score).toBe(0);
  });
});

describe("scoreAccessibility", () => {
  const penalty = READINESS_CONFIG.accessibilityPenaltyPerIssue;

  it("should return 100 when shelf is not locked", () => {
    const result = scoreAccessibility({ isLocked: false }, penalty);
    expect(result.score).toBe(100);
    expect(result.reasons).toHaveLength(0);
  });

  it("should subtract penalty when shelf is locked", () => {
    const result = scoreAccessibility({ isLocked: true }, penalty);
    expect(result.score).toBe(50);
    expect(result.reasons).toContain("Kệ bị khóa hoặc thiếu quyền truy cập");
  });

  it("should never go below 0", () => {
    expect(scoreAccessibility({ isLocked: true }, 120).score).toBe(0);
  });
});

describe("scoreQuantity", () => {
  it("should return 0 when nothing in system", () => {
    expect(scoreQuantity({ systemQty: 0, countedQty: null, onLoanQty: 0 }).score).toBe(0);
  });

  it("should return 100 when counted matches system and nothing on loan", () => {
    expect(scoreQuantity({ systemQty: 100, countedQty: 100, onLoanQty: 0 }).score).toBe(100);
  });

  it("should reduce score for quantity on loan", () => {
    const result = scoreQuantity({ systemQty: 100, countedQty: 100, onLoanQty: 20 });
    expect(result.score).toBe(80);
    expect(result.reasons.some((r) => r.includes("mượn"))).toBe(true);
  });

  it("should cap at 50 when never counted", () => {
    const result = scoreQuantity({ systemQty: 100, countedQty: null, onLoanQty: 0 });
    expect(result.score).toBe(50);
    expect(result.reasons.some((r) => r.includes("Chưa kiểm kê"))).toBe(true);
  });

  it("should reflect count shortfall against system", () => {
    const result = scoreQuantity({ systemQty: 100, countedQty: 80, onLoanQty: 0 });
    expect(result.score).toBe(80);
    expect(result.reasons.some((r) => r.includes("thiếu"))).toBe(true);
  });
});

describe("scoreEnvironment", () => {
  const t = READINESS_CONFIG.environment;

  it("should return 100 when within thresholds", () => {
    expect(scoreEnvironment({ temperature: 28, humidity: 60 }, t).score).toBe(100);
  });

  it("should return 100 when sensor data missing", () => {
    expect(scoreEnvironment({ temperature: null, humidity: null }, t).score).toBe(100);
  });

  it("should reduce score when humidity exceeds threshold", () => {
    const result = scoreEnvironment({ temperature: 28, humidity: 90 }, t);
    expect(result.score).toBeLessThan(100);
    expect(result.reasons.some((r) => r.includes("Độ ẩm"))).toBe(true);
  });

  it("should take the worse of temperature and humidity", () => {
    const hotAndHumid = scoreEnvironment({ temperature: 45, humidity: 95 }, t);
    const onlyHumid = scoreEnvironment({ temperature: 28, humidity: 95 }, t);
    expect(hotAndHumid.score).toBeLessThanOrEqual(onlyHumid.score);
  });
});

describe("scoreDataReliability", () => {
  it("should return high score for recent count and fresh sensor", () => {
    const result = scoreDataReliability({ daysSinceLastCount: 3, sensorFresh: true });
    expect(result.score).toBe(100);
  });

  it("should reduce score when sensor is stale", () => {
    const result = scoreDataReliability({ daysSinceLastCount: 3, sensorFresh: false });
    // countScore 100 * 0.6 + sensorScore 0 * 0.4 = 60
    expect(result.score).toBe(60);
    expect(result.reasons.some((r) => r.includes("Cảm biến"))).toBe(true);
  });

  it("should penalize never counted", () => {
    const result = scoreDataReliability({ daysSinceLastCount: null, sensorFresh: true });
    // neverCounted 30 * 0.6 + 100 * 0.4 = 58
    expect(result.score).toBe(58);
    expect(result.reasons.some((r) => r.includes("Chưa từng kiểm kê"))).toBe(true);
  });

  it("should return 0 count factor for very old count", () => {
    const result = scoreDataReliability({ daysSinceLastCount: 120, sensorFresh: true });
    // countScore 0 * 0.6 + 100 * 0.4 = 40
    expect(result.score).toBe(40);
  });
});

describe("combineComponents", () => {
  const perfect: ComponentScore[] = [
    { key: "quantityAvailability", score: 100, reasons: [] },
    { key: "itemCondition", score: 100, reasons: [] },
    { key: "expiry", score: 100, reasons: [] },
    { key: "accessibility", score: 100, reasons: [] },
    { key: "environment", score: 100, reasons: [] },
    { key: "dataReliability", score: 100, reasons: [] },
  ];

  it("should return 100 when all components are perfect", () => {
    expect(combineComponents(perfect).score).toBe(100);
  });

  it("should weight components per READINESS_WEIGHTS", () => {
    // Chỉ quantity (28%) rớt về 0 → tổng = 72.
    const withZeroQuantity = perfect.map((c) =>
      c.key === "quantityAvailability" ? { ...c, score: 0 } : c,
    );
    expect(combineComponents(withZeroQuantity).score).toBe(72);
  });

  it("should preserve components for breakdown", () => {
    const result = combineComponents(perfect);
    expect(result.components).toHaveLength(6);
  });
});
