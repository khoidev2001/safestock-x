import { IncidentType } from "@safestock/shared-types";
import { buildTemplateNarrative, computeForecasts, scoreSeverity } from "../action-plan";
import { IncidentInput } from "../mission.compute";

const flood: IncidentInput = {
  incidentType: IncidentType.FLOOD,
  affectedPeople: 100,
  durationHours: 24,
  children: 10,
  elderly: 5,
  medicalSupportCases: 3,
};

const minor: IncidentInput = {
  incidentType: IncidentType.OTHER,
  affectedPeople: 5,
  durationHours: 2,
  children: 0,
  elderly: 0,
  medicalSupportCases: 0,
};

describe("scoreSeverity", () => {
  it("lũ lớn + nhóm dễ tổn thương + thiếu vật tư → mức cao (4-5)", () => {
    const { level, reasons } = scoreSeverity(flood, 40);
    expect(level).toBeGreaterThanOrEqual(4);
    expect(reasons.length).toBeGreaterThan(0);
  });

  it("tình huống nhỏ, đủ vật tư → mức thấp (1-2)", () => {
    const { level } = scoreSeverity(minor, 100);
    expect(level).toBeLessThanOrEqual(2);
  });

  it("luôn trong khoảng 1-5", () => {
    expect(scoreSeverity(flood, 0).level).toBeLessThanOrEqual(5);
    expect(scoreSeverity(minor, 100).level).toBeGreaterThanOrEqual(1);
  });

  it("nhất quán: cùng input → cùng kết quả", () => {
    expect(scoreSeverity(flood, 50)).toEqual(scoreSeverity(flood, 50));
  });
});

describe("computeForecasts", () => {
  it("trả 3 dự báo, mỗi cái 0-100%", () => {
    const forecasts = computeForecasts(flood, 40);
    expect(forecasts).toHaveLength(3);
    for (const f of forecasts) {
      expect(f.probability).toBeGreaterThanOrEqual(0);
      expect(f.probability).toBeLessThanOrEqual(100);
    }
  });

  it("đáp ứng thấp → xác suất thiếu vật tư cao", () => {
    const low = computeForecasts(flood, 20).find((f) => f.label === "Thiếu vật tư");
    const high = computeForecasts(flood, 90).find((f) => f.label === "Thiếu vật tư");
    expect(low!.probability).toBeGreaterThan(high!.probability);
  });
});

describe("buildTemplateNarrative (fallback)", () => {
  it("luôn ra 3 giai đoạn + mục tiêu + câu hỏi", () => {
    const n = buildTemplateNarrative(flood, []);
    expect(n.phases).toHaveLength(3);
    expect(n.phases.map((p) => p.window)).toEqual(["0-2h", "2-6h", "6-24h"]);
    expect(n.objectives.length).toBeGreaterThan(0);
    expect(n.followUpQuestions.length).toBeGreaterThan(0);
  });

  it("có shortage → cảnh báo nêu tên vật tư thiếu", () => {
    const n = buildTemplateNarrative(flood, [
      {
        sku: "WATER-01",
        itemName: "Nước uống",
        unit: "lít",
        required: 100,
        allocated: 60,
        shortage: 40,
        fromWarehouses: [],
      },
    ]);
    expect(n.warnings.some((w) => w.includes("Nước uống"))).toBe(true);
  });
});
