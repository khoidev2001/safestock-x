import { IncidentType } from "@safestock/shared-types";
import { buildTemplateNarrative, computeForecasts, scoreSeverity } from "../action-plan";
import { countVulnerablePeople, IncidentInput } from "../mission.compute";

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

describe("countVulnerablePeople", () => {
  // Ca có thật đã hiện lên màn hình: báo 200 người, trong đó 50 trẻ em, 75 người già
  // và 200 ca y tế — cộng thẳng ra 325, đông hơn cả số người gặp nạn.
  it("không vượt quá tổng số người gặp nạn", () => {
    expect(
      countVulnerablePeople({
        ...flood,
        affectedPeople: 200,
        children: 50,
        elderly: 75,
        medicalSupportCases: 200,
      }),
    ).toBe(200);
  });

  it("số liệu nhất quán thì vẫn là phép cộng ba nhóm", () => {
    expect(countVulnerablePeople(flood)).toBe(18);
  });

  it("không nhóm nào thì bằng 0", () => {
    expect(countVulnerablePeople(minor)).toBe(0);
  });

  it("số liệu tự mâu thuẫn thì giữ lấy nhóm đông nhất, không trả về 0", () => {
    // Tổng số người khai thiếu (hoặc chưa khai) mà một nhóm đã đông hơn nó: cắt cứng
    // ở tổng số người sẽ xoá sạch nhóm dễ tổn thương khỏi đánh giá tình huống.
    expect(
      countVulnerablePeople({ ...flood, affectedPeople: 0, children: 12, elderly: 4, medicalSupportCases: 0 }),
    ).toBe(12);
  });
});

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
  it("luôn ra mục tiêu + cảnh báo + câu hỏi", () => {
    const n = buildTemplateNarrative(flood, []);
    expect(n.objectives.length).toBeGreaterThan(0);
    expect(n.warnings.length).toBeGreaterThan(0);
    expect(n.followUpQuestions.length).toBeGreaterThan(0);
    // Phần chia việc theo giai đoạn đã bỏ khỏi kế hoạch cứu hộ — bản mẫu fallback
    // cũng không được dựng lại, nếu không nó sẽ là chỗ duy nhất còn sinh ra khối đó.
    expect(n).not.toHaveProperty("phases");
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
