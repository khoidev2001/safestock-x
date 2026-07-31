import { CoordinationAnalysis, SituationExtraction } from "@safestock/shared-types";
import { CoordinationAnalysisService } from "../coordination-analysis.service";

const analysis = {
  schemaVersion: "coordination-analysis.v1",
  status: "NEEDS_CONFIRMATION",
  reception: {
    locationFactId: null,
    affectedPeopleFactId: null,
    incidentTypeFactId: null,
    weatherFactId: null,
    operationalStatus: "NEEDS_CONFIRMATION",
  },
  urgency: {
    level: null,
    label: "Chua du du kien",
    confidence: null,
    status: "NEEDS_CONFIRMATION",
    basisFactIds: [],
    ruleVersion: null,
  },
  facts: [],
  missingData: [],
  conflicts: [],
  requirements: { status: "PENDING_DATA", items: [], reason: "Thieu du lieu", ruleVersion: null },
  coordination: {
    status: "PENDING_DATA",
    allocations: [],
    fulfillmentPercent: null,
    reason: "Thieu du lieu",
    externalContacts: [],
  },
  forecasts: [],
  priorityQuestion: null,
  explanation: { summary: "Cho xac minh", invalidatedBy: [] },
  adminControls: ["REQUEST_MORE_INFORMATION"],
  computedAt: "2026-07-28T01:00:00.000Z",
  versions: {
    model: "situation-extractor.v1",
    rules: "coordination-rules.v1",
    geoRegistry: "2026-07-28",
    routingGraph: null,
    weatherSnapshot: null,
  },
} as CoordinationAnalysis;

function aiExtraction(): SituationExtraction {
  return {
    schemaVersion: "situation-extraction.v1",
    facts: [
      {
        id: "F1",
        key: "ISOLATION_RISK",
        provenance: "REPORTED",
        value: true,
        qualifier: "POSSIBLE",
        source: {
          sourceType: "USER_REPORT",
          sourceId: "mission-1",
          excerpt: "co kha nang bi co lap",
          capturedAt: null,
        },
      },
    ],
    missingData: [],
    conflicts: [],
    priorityQuestion: null,
  };
}

function makeService() {
  const missions = {
    getMission: jest
      .fn()
      .mockResolvedValue({ id: "mission-1", reportText: "co kha nang bi co lap" }),
  };
  const ai = { analyzeSituation: jest.fn().mockResolvedValue(aiExtraction()) };
  const snapshots = {
    compute: jest.fn().mockResolvedValue({
      analysis,
      snapshotInput: { mission: { id: "mission-1" } },
      fingerprint: "sha256:baseline-1",
    }),
  };
  const persistence = {
    saveAnalysisSnapshot: jest.fn().mockResolvedValue({ id: "snapshot-1" }),
  };
  return {
    missions,
    ai,
    snapshots,
    persistence,
    service: new CoordinationAnalysisService(
      missions as never,
      ai as never,
      snapshots as never,
      persistence as never,
    ),
  };
}

describe("CoordinationAnalysisService", () => {
  it("composes a baseline then persists the immutable snapshot", async () => {
    const { service, ai, snapshots, persistence } = makeService();

    const result = await service.analyze("mission-1", "admin-1", null, {
      requestId: "analysis-req-0001",
    });

    expect(ai.analyzeSituation).toHaveBeenCalledWith(
      expect.objectContaining({ description: "co kha nang bi co lap", sourceId: "mission-1" }),
    );
    expect(snapshots.compute).toHaveBeenCalledWith("mission-1", aiExtraction(), expect.any(Object));
    expect(persistence.saveAnalysisSnapshot).toHaveBeenCalledWith(
      "mission-1",
      "admin-1",
      null,
      expect.objectContaining({ kind: "BASELINE", fingerprint: "sha256:baseline-1" }),
    );
    expect(result.analysis).toEqual(analysis);
  });

  it("keeps the report usable with a deterministic fallback when AI is unavailable", async () => {
    const { service, ai, snapshots } = makeService();
    ai.analyzeSituation.mockRejectedValue(new Error("offline"));

    await service.analyze("mission-1", "admin-1", null, { requestId: "analysis-req-0001" });

    const fallback = snapshots.compute.mock.calls[0][1] as SituationExtraction;
    expect(fallback.facts).toEqual(
      expect.arrayContaining([expect.objectContaining({ key: "OTHER", provenance: "REPORTED" })]),
    );
    expect(fallback.facts).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ provenance: "AI_INFERENCE" })]),
    );
  });
});
