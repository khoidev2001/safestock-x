import { Logger } from "@nestjs/common";
import { FieldUpdateAssistantService } from "../field-update-assistant.service";

const update = {
  id: "field-update-1",
  confirmedText: "Cầu La Hai không qua được, lực lượng chưa thể tiếp cận điểm tập kết.",
  inputMode: "VOICE_TRANSCRIPT",
  clientCapturedAt: new Date("2026-07-28T02:00:00.000Z"),
};

function makeService(overrides: Record<string, unknown> = {}) {
  const coordination = {
    recordFieldUpdate: jest.fn().mockResolvedValue(update),
    listAnalysisSnapshots: jest.fn().mockResolvedValue([]),
    saveFieldUpdateIntent: jest
      .fn()
      .mockImplementation(
        async (_missionId, _actorId, _scope, fieldUpdate, intent, provenance) => ({
          ...fieldUpdate,
          structuredIntent: intent,
          intentProvenance: provenance,
        }),
      ),
  };
  const ai = {
    analyzeFieldUpdateIntent: jest.fn().mockRejectedValue(new Error("AI unavailable")),
  };
  const notifications = { create: jest.fn().mockResolvedValue({ id: "notification-1" }) };
  const whatIf = { simulate: jest.fn() };
  return {
    coordination: Object.assign(coordination, overrides.coordination),
    ai: Object.assign(ai, overrides.ai),
    notifications: Object.assign(notifications, overrides.notifications),
    whatIf: Object.assign(whatIf, overrides.whatIf),
    service: new FieldUpdateAssistantService(
      Object.assign(coordination, overrides.coordination) as never,
      Object.assign(ai, overrides.ai) as never,
      Object.assign(notifications, overrides.notifications) as never,
      Object.assign(whatIf, overrides.whatIf) as never,
    ),
  };
}

describe("FieldUpdateAssistantService", () => {
  it("persists confirmed evidence even when AI intent extraction is unavailable", async () => {
    const { service, coordination, notifications } = makeService();

    const result = await service.submit("mission-1", "rescue-1", null, {
      requestId: "field-update-request-0001",
      inputMode: "VOICE_TRANSCRIPT",
      confirmedText: update.confirmedText,
      confirmedByUser: true,
    });

    expect(coordination.recordFieldUpdate).toHaveBeenCalledTimes(1);
    expect(coordination.saveFieldUpdateIntent).toHaveBeenCalledWith(
      "mission-1",
      "rescue-1",
      null,
      update,
      expect.objectContaining({
        schemaVersion: "field-update-intent.v1",
        kind: "ROUTE_HAZARD",
        requiresAdminVerification: true,
        unresolvedReferences: [update.confirmedText],
      }),
      expect.objectContaining({ source: "BACKEND_FALLBACK" }),
    );
    expect((result.structuredIntent as { kind: string }).kind).toBe("ROUTE_HAZARD");
    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientRole: "ADMIN",
        kind: "FIELD_UPDATE_REPORTED",
        missionId: "mission-1",
      }),
    );
  });

  it("keeps an unresolved route reference for ADMIN instead of treating it as a real route", async () => {
    const intent = {
      schemaVersion: "field-update-intent.v1" as const,
      kind: "ROUTE_HAZARD" as const,
      confidence: 0.9,
      sourceExcerpt: "Cầu La Hai không qua được",
      requiresAdminVerification: true as const,
      facts: [
        {
          id: "F1",
          key: "OTHER" as const,
          provenance: "REPORTED" as const,
          value: "Cầu La Hai không qua được",
          qualifier: "EXACT" as const,
          source: {
            sourceType: "FIELD_UPDATE" as const,
            sourceId: "field-update-1",
            excerpt: "Cầu La Hai không qua được",
            capturedAt: "2026-07-28T02:00:00.000Z",
          },
        },
      ],
      resolvedReferenceIds: [],
      unresolvedReferences: ["Cầu La Hai không qua được"],
    };
    const { service, coordination } = makeService({
      ai: { analyzeFieldUpdateIntent: jest.fn().mockResolvedValue(intent) },
    });

    await service.submit("mission-1", "rescue-1", null, {
      requestId: "field-update-request-0001",
      inputMode: "TEXT",
      confirmedText: update.confirmedText,
      confirmedByUser: true,
    });

    expect(coordination.saveFieldUpdateIntent).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      null,
      expect.anything(),
      expect.objectContaining({
        resolvedReferenceIds: [],
        unresolvedReferences: ["Cầu La Hai không qua được"],
      }),
      expect.objectContaining({ source: "AI_SERVICE" }),
    );
  });

  it("creates only an isolated preliminary What-if when a baseline exists", async () => {
    const { service, coordination, whatIf } = makeService({
      coordination: {
        listAnalysisSnapshots: jest
          .fn()
          .mockResolvedValue([{ id: "baseline-1", kind: "BASELINE" }]),
      },
      whatIf: {
        simulate: jest.fn().mockResolvedValue({
          snapshot: { id: "simulation-1", expiresAt: "2026-07-28T02:30:00.000Z" },
          simulation: { unresolvedAssumptions: [{ id: "assumption-1" }] },
        }),
      },
    });

    await service.submit("mission-1", "rescue-1", null, {
      requestId: "field-update-request-0001",
      inputMode: "TEXT",
      confirmedText: update.confirmedText,
      confirmedByUser: true,
    });

    expect(whatIf.simulate).toHaveBeenCalledWith(
      "mission-1",
      "rescue-1",
      null,
      expect.objectContaining({
        baselineSnapshotId: "baseline-1",
        assumptionText: update.confirmedText,
      }),
    );
    expect(coordination.saveFieldUpdateIntent).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      null,
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        preliminarySimulation: expect.objectContaining({
          status: "CREATED",
          snapshotId: "simulation-1",
        }),
      }),
    );
  });

  it("retries the idempotent ADMIN notification when evidence was already enriched", async () => {
    const structuredIntent = {
      schemaVersion: "field-update-intent.v1" as const,
      kind: "ROUTE_HAZARD" as const,
      confidence: 0.8,
      sourceExcerpt: update.confirmedText,
      requiresAdminVerification: true as const,
      facts: [
        {
          id: "F1",
          key: "OTHER" as const,
          provenance: "REPORTED" as const,
          value: update.confirmedText,
          qualifier: "EXACT" as const,
          source: {
            sourceType: "FIELD_UPDATE" as const,
            sourceId: update.id,
            excerpt: update.confirmedText,
            capturedAt: "2026-07-28T02:00:00.000Z",
          },
        },
      ],
      resolvedReferenceIds: [],
      unresolvedReferences: [update.confirmedText],
    };
    const { service, coordination, ai, notifications } = makeService({
      coordination: {
        recordFieldUpdate: jest.fn().mockResolvedValue({
          ...update,
          structuredIntent,
        }),
      },
    });

    await service.submit("mission-1", "rescue-1", null, {
      requestId: "field-update-request-0001",
      inputMode: "TEXT",
      confirmedText: update.confirmedText,
      confirmedByUser: true,
    });

    expect(ai.analyzeFieldUpdateIntent).not.toHaveBeenCalled();
    expect(coordination.saveFieldUpdateIntent).not.toHaveBeenCalled();
    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({
        missionId: "mission-1",
        fieldUpdateId: update.id,
      }),
    );
  });

  it("does not log confirmed-text or provider details when field-intent enrichment fails", async () => {
    const warn = jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    const { service } = makeService({
      ai: {
        analyzeFieldUpdateIntent: jest
          .fn()
          .mockRejectedValue(
            new Error("provider failed: token=secret-789 transcript=private field text"),
          ),
      },
    });

    await service.submit("mission-1", "rescue-1", null, {
      requestId: "field-update-request-0001",
      inputMode: "TEXT",
      confirmedText: update.confirmedText,
      confirmedByUser: true,
    });

    const logs = JSON.stringify(warn.mock.calls);
    expect(logs).not.toContain("secret-789");
    expect(logs).not.toContain("private field text");
  });
});
