import { ReadinessComponentKey } from "@safestock/shared-types";
import { assessOperationalReadiness } from "../operational-readiness";

const COMPONENTS: ReadinessComponentKey[] = [
  "quantityAvailability",
  "itemCondition",
  "expiry",
  "accessibility",
  "environment",
  "dataReliability",
];

function components(overrides: Partial<Record<ReadinessComponentKey, number>> = {}) {
  return COMPONENTS.map((key) => ({
    key,
    score: overrides[key] ?? 100,
    reasons: overrides[key] === undefined ? [] : [`${key} cần xử lý`],
  }));
}

describe("assessOperationalReadiness", () => {
  it("blocks a high-scoring warehouse when a critical fire risk is open", () => {
    const result = assessOperationalReadiness({
      referenceScore: 95,
      components: components(),
      openIncidents: [
        { kind: "FIRE_RISK", severity: "CRITICAL", title: "Phát hiện khói và nhiệt" },
      ],
    });

    expect(result.operationalStatus).toBe("NOT_DISPATCHABLE");
    expect(result.blockers).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "CRITICAL_FIRE_RISK" })]),
    );
  });

  it("blocks when warehouse accessibility is completely unavailable", () => {
    const result = assessOperationalReadiness({
      referenceScore: 90,
      components: components({ accessibility: 0 }),
      openIncidents: [],
    });

    expect(result.operationalStatus).toBe("NOT_DISPATCHABLE");
    expect(result.blockers[0]).toEqual(expect.objectContaining({ code: "ACCESS_UNAVAILABLE" }));
  });

  it("returns needs action for a low reference score without blockers", () => {
    const result = assessOperationalReadiness({
      referenceScore: 65,
      components: components({ quantityAvailability: 55 }),
      openIncidents: [],
    });

    expect(result.operationalStatus).toBe("NEEDS_ACTION");
    expect(result.blockers).toHaveLength(0);
    expect(result.dimensions.find((item) => item.key === "quantityAvailability")?.status).toBe(
      "NEEDS_ACTION",
    );
  });

  it("returns ready when all dimensions are healthy and no incident is open", () => {
    const result = assessOperationalReadiness({
      referenceScore: 94,
      components: components(),
      openIncidents: [],
    });

    expect(result.operationalStatus).toBe("READY");
    expect(result.blockers).toHaveLength(0);
    expect(result.dimensions.every((item) => item.status === "READY")).toBe(true);
  });
});
