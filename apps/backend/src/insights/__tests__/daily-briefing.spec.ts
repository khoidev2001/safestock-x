import {
  buildDailyBriefingPriorities,
  buildDailyBriefingFacts,
  buildDailyBriefingTemplate,
  DailyBriefingSnapshot,
  narrativeUsesOnlySnapshotNumbers,
} from "../daily-briefing";

const snapshot: DailyBriefingSnapshot = {
  date: "2026-07-27",
  warehouse: { name: "Kho trung tâm" },
  readiness: { score: 82, maxScore: 100, operationalStatus: "NEEDS_ACTION" },
  weather: { totalRainMm: 145.5, periodHours: 72, alert: true },
  inventory: { lowStockCount: 3, expiringBatchCount: 2, weatherRiskCount: 1 },
  incidents: { openCount: 2, highOrCriticalCount: 1 },
};

describe("daily briefing safety", () => {
  it("chấp nhận narrative chỉ dùng số trong snapshot", () => {
    expect(
      narrativeUsesOnlySnapshotNumbers(
        "Readiness 82/100. Mưa 72 giờ khoảng 145,5 mm; có 2 sự cố.",
        snapshot,
      ),
    ).toBe(true);
  });

  it("từ chối số do LLM tự thêm", () => {
    expect(narrativeUsesOnlySnapshotNumbers("Cần nhập thêm 500 áo phao.", snapshot)).toBe(false);
  });

  it("template và ưu tiên vẫn hoạt động khi LLM tắt", () => {
    expect(buildDailyBriefingTemplate(snapshot)).toContain("145.5 mm");
    expect(
      buildDailyBriefingPriorities(snapshot, [
        { itemName: "Nước uống", shortage: 12, unit: "lít" },
      ]),
    ).toEqual([
      "Rà soát bổ sung Nước uống: dự báo thiếu 12 lít trong 72 giờ.",
      "Xử lý 1 sự cố mức cao hoặc nghiêm trọng đang mở.",
      "Rà soát 3 mặt hàng tồn thấp.",
      "Xử lý 2 lô gần hết hạn, ưu tiên lô hết hạn trước.",
    ]);
  });

  it("fact cho AI chỉ chứa câu backend đã render và đủ 4 mảng vận hành", () => {
    const facts = buildDailyBriefingFacts(snapshot);
    expect(facts.map((fact) => fact.id)).toEqual(["F1", "F2", "F3", "F4"]);
    expect(facts.map((fact) => fact.text).join(" ")).toContain("82/100");
    expect(facts.map((fact) => fact.text).join(" ")).toContain("145.5 mm");
    expect(facts.map((fact) => fact.text).join(" ")).toContain("2 sự cố");
  });

  it("kho không có vấn đề gì thì không đọc ra các con số 0", () => {
    // Bản tin cũ luôn đọc đủ 4 câu, nên ngày yên ổn vẫn nghe "0 mặt hàng tồn
    // thấp, 0 sự cố đang mở" — ba con số 0 chen giữa làm loãng dòng cần chú ý.
    const calmSnapshot: DailyBriefingSnapshot = {
      ...snapshot,
      inventory: { lowStockCount: 0, expiringBatchCount: 0, weatherRiskCount: 0 },
      incidents: { openCount: 0, highOrCriticalCount: 0 },
    };
    const facts = buildDailyBriefingFacts(calmSnapshot);

    expect(facts.map((fact) => fact.id)).toEqual(["F1", "F2"]);
    expect(facts.map((fact) => fact.text).join(" ")).not.toMatch(/(?<!\d)0 /u);
  });

  it("chỉ có lô gần hết hạn thì không nhắc tới mặt hàng tồn thấp", () => {
    const facts = buildDailyBriefingFacts({
      ...snapshot,
      inventory: { lowStockCount: 0, expiringBatchCount: 3, weatherRiskCount: 0 },
      incidents: { openCount: 0, highOrCriticalCount: 0 },
    });
    const text = facts.map((fact) => fact.text).join(" ");

    expect(text).toContain("3 lô gần hết hạn");
    expect(text).not.toContain("tồn thấp");
  });

  it("mọi câu hiển thị đều là tiếng Việt, không lọt readiness hay FEFO", () => {
    const text = [
      ...buildDailyBriefingFacts(snapshot).map((fact) => fact.text),
      ...buildDailyBriefingPriorities(snapshot, []),
    ].join(" ");

    expect(text).not.toMatch(/readiness|FEFO|blocker/i);
    expect(text).toContain("điểm sẵn sàng");
  });
});
