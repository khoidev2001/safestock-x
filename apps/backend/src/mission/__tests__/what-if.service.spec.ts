import { CoordinationAnalysis } from "@safestock/shared-types";
import { WhatIfService } from "../what-if.service";

const baselineAnalysis = {
  schemaVersion: "coordination-analysis.v1",
  status: "PRELIMINARY",
  reception: {
    locationFactId: null,
    affectedPeopleFactId: "F1",
    incidentTypeFactId: "F2",
    weatherFactId: null,
    operationalStatus: "PRELIMINARY",
  },
  urgency: {
    level: 3,
    label: "Muc uu tien 3/5",
    confidence: 0.6,
    status: "PRELIMINARY",
    basisFactIds: ["F1"],
    ruleVersion: "coordination-rules.v1",
  },
  facts: [
    {
      id: "F1",
      key: "AFFECTED_PEOPLE",
      provenance: "REPORTED",
      value: 18,
      qualifier: "EXACT",
      source: {
        sourceType: "USER_REPORT",
        sourceId: "mission-1",
        excerpt: "18 nguoi",
        capturedAt: null,
      },
    },
    {
      id: "F2",
      key: "INCIDENT_TYPE",
      provenance: "REPORTED",
      value: "FLOOD",
      qualifier: "EXACT",
      source: { sourceType: "USER_REPORT", sourceId: "mission-1", excerpt: "Lu", capturedAt: null },
    },
  ],
  missingData: [],
  conflicts: [],
  requirements: {
    status: "COMPUTED",
    items: [
      {
        sku: "water",
        name: "Nuoc uong",
        unit: "chai",
        baseQuantity: 36,
        reserveQuantity: 0,
        totalQuantity: 36,
        basis: "backend",
        sourceFactIds: ["F1"],
        ruleVersion: "coordination-rules.v1",
      },
    ],
    reason: null,
    ruleVersion: "coordination-rules.v1",
  },
  coordination: {
    status: "COMPUTED",
    allocations: [
      {
        warehouseId: "central",
        warehouseName: "Kho UBND Dong Xuan",
        sku: "water",
        quantity: 20,
        routeId: "route:mission-1:central",
        distanceKm: 2,
        etaMinutes: 8,
        routeStatus: "AVAILABLE",
      },
    ],
    fulfillmentPercent: 56,
    reason: null,
    externalContacts: [],
  },
  forecasts: [],
  priorityQuestion: null,
  explanation: { summary: "Baseline", invalidatedBy: [] },
  adminControls: ["RUN_WHAT_IF"],
  computedAt: "2026-07-28T01:00:00.000Z",
  versions: {
    model: "situation-extractor.v1",
    rules: "coordination-rules.v1",
    geoRegistry: "2026-07-28",
    routingGraph: "local-osrm",
    weatherSnapshot: null,
  },
} as CoordinationAnalysis;

function makeService() {
  const persistence = {
    getAnalysisSnapshot: jest.fn().mockResolvedValue({
      id: "baseline-1",
      missionId: "mission-1",
      kind: "BASELINE",
      fingerprint: "sha256:baseline",
      input: { mission: { affectedPeople: 18, durationHours: 24 } },
      result: baselineAnalysis,
    }),
    saveAnalysisSnapshot: jest.fn().mockResolvedValue({ id: "what-if-1" }),
  };
  return { persistence, service: new WhatIfService(persistence as never) };
}

describe("WhatIfService", () => {
  it("maps a natural-language people assumption to the whitelist and persists only a WHAT_IF snapshot", async () => {
    const { service, persistence } = makeService();

    const result = await service.simulate("mission-1", "admin-1", null, {
      requestId: "what-if-req-0001",
      baselineSnapshotId: "baseline-1",
      assumptionText: "neu co 36 nguoi can ho tro",
    });

    expect(result.simulation.assumptions).toEqual([
      expect.objectContaining({ kind: "AFFECTED_PEOPLE", affectedPeople: 36 }),
    ]);
    expect(result.simulation.delta.metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "requiredQuantity", baseline: 36, simulated: 72 }),
      ]),
    );
    expect(persistence.saveAnalysisSnapshot).toHaveBeenCalledWith(
      "mission-1",
      "admin-1",
      null,
      expect.objectContaining({
        kind: "WHAT_IF",
        baselineSnapshotId: "baseline-1",
        input: expect.objectContaining({
          simulation: expect.objectContaining({
            delta: expect.objectContaining({ metrics: expect.any(Array) }),
          }),
        }),
      }),
    );
  });

  it("does not guess an unknown bridge or route reference", async () => {
    const { service, persistence } = makeService();

    const result = await service.simulate("mission-1", "admin-1", null, {
      requestId: "what-if-req-0001",
      baselineSnapshotId: "baseline-1",
      assumptionText: "cầu Suối Vàng bị ngập",
    });

    expect(result.simulation.unresolvedAssumptions).toEqual([
      expect.objectContaining({ resolution: "UNRESOLVED", reason: "UNKNOWN_REFERENCE" }),
    ]);
    expect(persistence.saveAnalysisSnapshot).toHaveBeenCalledTimes(1);
  });

  it("excludes only a route whose persisted geometry crosses a verified bridge", async () => {
    const { service, persistence } = makeService();
    persistence.getAnalysisSnapshot.mockResolvedValue({
      id: "baseline-1",
      missionId: "mission-1",
      kind: "BASELINE",
      fingerprint: "sha256:baseline",
      input: {
        mission: { affectedPeople: 18, durationHours: 24 },
        routeSnapshots: [
          {
            routeId: "route:mission-1:central",
            geometry: {
              type: "LineString",
              coordinates: [
                [109.104259, 13.3782428],
                [109.1122399, 13.3721288],
                [109.12, 13.36],
              ],
            },
            roadRefs: [],
          },
        ],
      },
      result: baselineAnalysis,
    });

    const result = await service.simulate("mission-1", "admin-1", null, {
      requestId: "what-if-la-hai-bridge",
      baselineSnapshotId: "baseline-1",
      assumptionText: "cầu La Hai bị ngập, không thể đi qua",
    });

    expect(result.simulation.assumptions).toEqual([
      expect.objectContaining({
        kind: "EXCLUDE_ROUTE",
        routeId: "route:mission-1:central",
        matchedReferenceId: "dx-bridge-la-hai",
      }),
    ]);
    expect(result.simulation.delta.routesChanged).toEqual(["route:mission-1:central"]);
  });

  it("recognizes a verified road name but keeps it unresolved without route topology", async () => {
    const { service } = makeService();

    const result = await service.simulate("mission-1", "admin-1", null, {
      requestId: "what-if-dt641",
      baselineSnapshotId: "baseline-1",
      assumptionText: "ĐT641 bị sạt lở",
    });

    expect(result.simulation.unresolvedAssumptions).toEqual([
      expect.objectContaining({
        resolution: "UNRESOLVED",
        requestedKind: "EXCLUDE_ROUTE",
        reason: "MISSING_TOPOLOGY",
        candidates: [{ id: "road-dt641", label: "ĐT641" }],
      }),
    ]);
  });

  it("treats a 72-hour rain forecast as weather only, not as mission duration", async () => {
    const { service, persistence } = makeService();
    const analysisWithForecast = {
      ...baselineAnalysis,
      versions: { ...baselineAnalysis.versions, weatherSnapshot: "forecast-72h-v1" },
    };
    persistence.getAnalysisSnapshot.mockResolvedValue({
      id: "baseline-1",
      missionId: "mission-1",
      kind: "BASELINE",
      fingerprint: "sha256:baseline",
      input: { mission: { affectedPeople: 18, durationHours: 24 } },
      result: analysisWithForecast,
    });

    const result = await service.simulate("mission-1", "admin-1", null, {
      requestId: "what-if-rain-72h",
      baselineSnapshotId: "baseline-1",
      assumptionText: "nếu mưa lớn kéo dài 72 giờ",
    });

    expect(result.simulation.assumptions).toEqual([
      expect.objectContaining({
        kind: "WEATHER_HORIZON",
        horizonHours: 72,
        forecastSnapshotId: "forecast-72h-v1",
      }),
    ]);
    expect(result.simulation.assumptions).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: "DURATION_HOURS" })]),
    );
  });

  it("uses duration only when an operational duration is stated explicitly", async () => {
    const { service } = makeService();

    const result = await service.simulate("mission-1", "admin-1", null, {
      requestId: "what-if-duration-12h",
      baselineSnapshotId: "baseline-1",
      assumptionText: "nếu nhiệm vụ cứu hộ kéo dài 12 giờ",
    });

    expect(result.simulation.assumptions).toEqual([
      expect.objectContaining({ kind: "DURATION_HOURS", durationHours: 12 }),
    ]);
  });
});
