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

  it("nhập tay không lời kể: lấy số liệu biểu mẫu làm dữ kiện, không gọi AI", async () => {
    // Nhiệm vụ lập từ form: không có reportText, nhưng cán bộ đã điền đủ số liệu.
    const { service, ai, snapshots, persistence, missions } = makeService();
    missions.getMission.mockResolvedValue({
      id: "mission-1",
      reportText: null,
      incidentType: "FLOOD",
      affectedPeople: 100,
      durationHours: 24,
      location: "Long Thăng",
    });

    await service.analyze("mission-1", "admin-1", null, { requestId: "analysis-req-0002" });

    // Không có câu chữ nào thì không có gì cho AI bóc tách — gọi sang chỉ tốn thời gian.
    expect(ai.analyzeSituation).not.toHaveBeenCalled();
    const extraction = snapshots.compute.mock.calls[0][1] as SituationExtraction;
    expect(extraction.facts.map((fact) => fact.key).sort()).toEqual([
      "AFFECTED_PEOPLE",
      "DURATION_HOURS",
      "INCIDENT_TYPE",
      "LOCATION",
    ]);
    // Trích dẫn là chính nội dung ô nhập, không phải câu văn dựng thêm.
    for (const fact of extraction.facts) {
      expect(fact.provenance).toBe("REPORTED");
      expect(fact.source?.excerpt).toMatch(/^(Loại tình huống|Số người|Số giờ dự kiến|Địa điểm)/);
    }
    expect(extraction.facts.map((fact) => fact.source?.excerpt)).toContain("Số người: 100");
    expect(persistence.saveAnalysisSnapshot).toHaveBeenCalledWith(
      "mission-1",
      "admin-1",
      null,
      expect.objectContaining({
        provenance: expect.objectContaining({ extractionSource: "BACKEND_FALLBACK" }),
      }),
    );
  });

  it("thiếu địa điểm thì bỏ hẳn dữ kiện đó, không điền chuỗi rỗng", async () => {
    const { service, snapshots, missions } = makeService();
    missions.getMission.mockResolvedValue({
      id: "mission-1",
      reportText: null,
      incidentType: "STORM",
      affectedPeople: 30,
      durationHours: 12,
      location: "   ",
    });

    await service.analyze("mission-1", "admin-1", null, { requestId: "analysis-req-0005" });

    const extraction = snapshots.compute.mock.calls[0][1] as SituationExtraction;
    expect(extraction.facts.some((fact) => fact.key === "LOCATION")).toBe(false);
  });

  it("mọi câu hiển thị đều là tiếng Việt có dấu, không lọt tiếng Anh", async () => {
    const { service, ai, snapshots, missions } = makeService();
    ai.analyzeSituation.mockRejectedValue(new Error("offline"));
    missions.getMission.mockResolvedValue({ id: "mission-1", reportText: "ngập sâu một mét" });
    await service.analyze("mission-1", "admin-1", null, { requestId: "analysis-req-0004" });

    const shown = snapshots.compute.mock.calls
      .map(([, extraction]) => extraction as SituationExtraction)
      .flatMap((extraction) => [
        ...extraction.missingData.flatMap((item) => [item.question, item.impact]),
        extraction.priorityQuestion?.question ?? "",
        extraction.priorityQuestion?.expectedImpact ?? "",
      ])
      .filter(Boolean);

    expect(shown.length).toBeGreaterThan(0);
    for (const line of shown) {
      expect(line).not.toMatch(/No report text/i);
      // Tiếng Việt không dấu là dấu hiệu chuỗi bị viết vội; bắt tại đây.
      expect(line).toMatch(/[ăâđêôơưáàảãạấầẩẫậéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/iu);
    }
  });
});
