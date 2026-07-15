import { buildRecommendations } from "../recommendations";
import { ComponentScore } from "../readiness.types";

const comp = (
  key: ComponentScore["key"],
  score: number,
  reasons: string[] = [],
): ComponentScore => ({ key, score, reasons });

describe("buildRecommendations", () => {
  it("should return no recommendation when all components are healthy", () => {
    const result = buildRecommendations([
      comp("expiry", 100),
      comp("itemCondition", 90),
    ]);
    expect(result).toHaveLength(0);
  });

  it("should recommend for components below threshold", () => {
    const result = buildRecommendations([
      comp("expiry", 40, ["Sắp hết hạn (còn ~1 tháng)"]),
      comp("itemCondition", 100),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].component).toBe("expiry");
    expect(result[0].message).toContain("Sắp hết hạn");
  });

  it("should sort recommendations by weakest component first", () => {
    const result = buildRecommendations([
      comp("expiry", 70, ["hạn dưới 6 tháng"]),
      comp("quantityAvailability", 30, ["chưa kiểm kê"]),
    ]);
    expect(result[0].component).toBe("quantityAvailability"); // 30 < 70
    expect(result[1].component).toBe("expiry");
  });

  it("should fall back to action-only message when no reason", () => {
    const result = buildRecommendations([comp("accessibility", 50, [])]);
    expect(result[0].message.length).toBeGreaterThan(0);
  });
});
