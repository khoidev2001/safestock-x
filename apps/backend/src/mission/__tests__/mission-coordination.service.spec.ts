import { BadRequestException, ConflictException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { COORDINATION_ANALYSIS_SCHEMA_VERSION, CoordinationAnalysis } from "@safestock/shared-types";
import { MissionCoordinationService } from "../mission-coordination.service";

const ACTOR_ID = "user-admin-1";
const MISSION_ID = "mission-1";
const REQUEST_ID = "field-req-0001";

function validAnalysis(): CoordinationAnalysis {
  return {
    schemaVersion: COORDINATION_ANALYSIS_SCHEMA_VERSION,
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
      label: "Chưa đủ dữ kiện",
      confidence: null,
      status: "NEEDS_CONFIRMATION",
      basisFactIds: [],
      ruleVersion: null,
    },
    facts: [],
    missingData: [],
    conflicts: [],
    requirements: { status: "PENDING_DATA", items: [], reason: "Thiếu dữ kiện", ruleVersion: null },
    coordination: {
      status: "PENDING_DATA",
      allocations: [],
      fulfillmentPercent: null,
      reason: "Thiếu dữ kiện",
      externalContacts: [],
    },
    forecasts: [],
    priorityQuestion: null,
    explanation: { summary: "Chờ xác minh", invalidatedBy: [] },
    adminControls: ["REQUEST_MORE_INFORMATION"],
    computedAt: "2026-07-28T01:00:00.000Z",
    versions: {
      model: "rule-based.v1",
      rules: "coordination-rules.v1",
      geoRegistry: "2026-07-28",
      routingGraph: null,
      weatherSnapshot: null,
    },
  };
}

function makeService(overrides: Record<string, unknown> = {}) {
  const prisma = {
    mission: {
      findUnique: jest.fn().mockResolvedValue({ id: MISSION_ID, warehouseId: "warehouse-1" }),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue({ organizationId: "org-1" }),
    },
    warehouse: {
      findUnique: jest.fn().mockResolvedValue({ organizationId: "org-1" }),
    },
    missionFieldUpdate: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: "field-update-1", confirmedText: "Đã đến điểm tập kết" }),
      update: jest.fn().mockResolvedValue({ id: "field-update-1" }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    missionAnalysisSnapshot: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: "snapshot-1", kind: "BASELINE" }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    ...overrides,
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  return {
    prisma,
    audit,
    service: new MissionCoordinationService(prisma as never, audit as never),
  };
}

describe("MissionCoordinationService", () => {
  it("only persists a confirmed field update and records it once", async () => {
    const { service, prisma, audit } = makeService();

    await service.recordFieldUpdate(MISSION_ID, ACTOR_ID, null, {
      requestId: REQUEST_ID,
      inputMode: "VOICE_TRANSCRIPT",
      confirmedText: "  Đã đến điểm tập kết  ",
      confirmedByUser: true,
      clientCapturedAt: "2026-07-28T01:03:00.000Z",
    });

    expect(prisma.missionFieldUpdate.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          missionId: MISSION_ID,
          actorId: ACTOR_ID,
          inputMode: "VOICE_TRANSCRIPT",
          confirmedText: "Đã đến điểm tập kết",
        }),
      }),
    );
    expect(audit.record).toHaveBeenCalledTimes(1);
  });

  it("rejects a field payload that tries to smuggle a GPS track", async () => {
    const { service } = makeService();

    await expect(
      service.recordFieldUpdate(MISSION_ID, ACTOR_ID, null, {
        requestId: REQUEST_ID,
        inputMode: "TEXT",
        confirmedText: "Đường bị chắn",
        confirmedByUser: true,
        gpsTrack: [{ lat: 13.3, lng: 109.1 }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("returns the original field update for an idempotent retry", async () => {
    const existing = { id: "field-update-existing", requestId: REQUEST_ID };
    const { service, prisma, audit } = makeService({
      missionFieldUpdate: {
        findUnique: jest.fn().mockResolvedValue(existing),
        create: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
    });

    await expect(
      service.recordFieldUpdate(MISSION_ID, ACTOR_ID, null, {
        requestId: REQUEST_ID,
        inputMode: "TEXT",
        confirmedText: "Đường bị chắn",
        confirmedByUser: true,
      }),
    ).resolves.toEqual(existing);
    expect(prisma.missionFieldUpdate.create).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it("stores only a source-grounded field intent that still requires ADMIN verification", async () => {
    const { service, prisma, audit } = makeService();
    const confirmedText = "Cầu La Hai không qua được.";

    await service.saveFieldUpdateIntent(
      MISSION_ID,
      ACTOR_ID,
      null,
      { id: "field-update-1", confirmedText },
      {
        schemaVersion: "field-update-intent.v1",
        kind: "ROUTE_HAZARD",
        confidence: 0.8,
        sourceExcerpt: confirmedText,
        requiresAdminVerification: true,
        facts: [
          {
            id: "F1",
            key: "OTHER",
            provenance: "REPORTED",
            value: confirmedText,
            qualifier: "EXACT",
            source: {
              sourceType: "FIELD_UPDATE",
              sourceId: "field-update-1",
              excerpt: confirmedText,
              capturedAt: null,
            },
          },
        ],
        resolvedReferenceIds: [],
        unresolvedReferences: [confirmedText],
      },
      { source: "AI_SERVICE" },
    );

    expect(prisma.missionFieldUpdate.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "field-update-1" },
        data: expect.objectContaining({ structuredIntent: expect.objectContaining({ kind: "ROUTE_HAZARD" }) }),
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "MISSION_FIELD_UPDATE_INTENT_SAVED" }));
  });

  it("persists a validated baseline snapshot with reproducibility stamps", async () => {
    const { service, prisma, audit } = makeService();
    const analysis = validAnalysis();

    await service.saveAnalysisSnapshot(MISSION_ID, ACTOR_ID, null, {
      kind: "BASELINE",
      requestId: "analysis-req-0001",
      fingerprint: "sha256:baseline-1",
      input: { missionId: MISSION_ID },
      provenance: { report: "mission-1" },
      result: analysis,
      modelVersion: analysis.versions.model,
      ruleVersion: analysis.versions.rules,
      geoRegistryVersion: analysis.versions.geoRegistry,
    });

    expect(prisma.missionAnalysisSnapshot.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          missionId: MISSION_ID,
          kind: "BASELINE",
          fingerprint: "sha256:baseline-1",
          modelVersion: "rule-based.v1",
          ruleVersion: "coordination-rules.v1",
        }),
      }),
    );
    expect(audit.record).toHaveBeenCalledTimes(1);
  });

  it("rejects destructive fields before a snapshot reaches persistence", async () => {
    const { service } = makeService();
    const analysis = { ...validAnalysis(), autoDispatch: true } as unknown as CoordinationAnalysis;

    await expect(
      service.saveAnalysisSnapshot(MISSION_ID, ACTOR_ID, null, {
        kind: "BASELINE",
        fingerprint: "sha256:baseline-1",
        input: {},
        provenance: {},
        result: analysis,
        modelVersion: "rule-based.v1",
        ruleVersion: "coordination-rules.v1",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects reuse of a snapshot request id with a different fingerprint", async () => {
    const { service } = makeService({
      missionAnalysisSnapshot: {
        findUnique: jest.fn().mockResolvedValue({ id: "snapshot-old", fingerprint: "sha256:old" }),
        create: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
    });
    const analysis = validAnalysis();

    await expect(
      service.saveAnalysisSnapshot(MISSION_ID, ACTOR_ID, null, {
        kind: "BASELINE",
        requestId: "analysis-req-0001",
        fingerprint: "sha256:new",
        input: {},
        provenance: {},
        result: analysis,
        modelVersion: analysis.versions.model,
        ruleVersion: analysis.versions.rules,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("returns the committed winner when concurrent snapshot creation races on the same request id", async () => {
    const winner = { id: "snapshot-winner", fingerprint: "sha256:baseline-1" };
    const { service, prisma, audit } = makeService({
      missionAnalysisSnapshot: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(winner),
        create: jest.fn().mockRejectedValue(
          new Prisma.PrismaClientKnownRequestError("duplicate request", {
            code: "P2002",
            clientVersion: "5.22.0",
          }),
        ),
        findMany: jest.fn().mockResolvedValue([]),
      },
    });
    const analysis = validAnalysis();

    await expect(
      service.saveAnalysisSnapshot(MISSION_ID, ACTOR_ID, null, {
        kind: "BASELINE",
        requestId: "analysis-req-0001",
        fingerprint: "sha256:baseline-1",
        input: { missionId: MISSION_ID },
        provenance: { report: "mission-1" },
        result: analysis,
        modelVersion: analysis.versions.model,
        ruleVersion: analysis.versions.rules,
      }),
    ).resolves.toEqual(winner);

    expect(prisma.missionAnalysisSnapshot.create).toHaveBeenCalledTimes(1);
    expect(audit.record).not.toHaveBeenCalled();
  });

  it("rejects a concurrent winner with the same request id but a different fingerprint", async () => {
    const { service } = makeService({
      missionAnalysisSnapshot: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({ id: "snapshot-winner", fingerprint: "sha256:other" }),
        create: jest.fn().mockRejectedValue(
          new Prisma.PrismaClientKnownRequestError("duplicate request", {
            code: "P2002",
            clientVersion: "5.22.0",
          }),
        ),
        findMany: jest.fn().mockResolvedValue([]),
      },
    });
    const analysis = validAnalysis();

    await expect(
      service.saveAnalysisSnapshot(MISSION_ID, ACTOR_ID, null, {
        kind: "BASELINE",
        requestId: "analysis-req-0001",
        fingerprint: "sha256:baseline-1",
        input: { missionId: MISSION_ID },
        provenance: { report: "mission-1" },
        result: analysis,
        modelVersion: analysis.versions.model,
        ruleVersion: analysis.versions.rules,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
