import { Injectable } from "@nestjs/common";
import { SituationExtraction } from "@safestock/shared-types";
import { AiClientService } from "../ai/ai-client.service";
import { CoordinationSnapshotService } from "./coordination-snapshot.service";
import { MissionCoordinationService } from "./mission-coordination.service";
import { MissionService } from "./mission.service";

export interface AnalyzeMissionInput {
  requestId: string;
  description?: string;
}

/**
 * Orchestrates AI extraction and the backend read-only calculation. Neither the
 * LLM nor this service can approve, dispatch, contact another commune or alter
 * a mission/inventory record; it only creates an immutable analysis snapshot.
 */
@Injectable()
export class CoordinationAnalysisService {
  constructor(
    private readonly missions: MissionService,
    private readonly ai: AiClientService,
    private readonly snapshots: CoordinationSnapshotService,
    private readonly persistence: MissionCoordinationService,
  ) {}

  async analyze(
    missionId: string,
    actorId: string,
    scopeWarehouseId: string | null | undefined,
    input: AnalyzeMissionInput,
  ) {
    const mission = await this.missions.getMission(missionId, actorId, scopeWarehouseId);
    const description = input.description?.trim() || mission.reportText?.trim() || null;
    const sourceId = mission.id;
    const sourceType = "USER_REPORT" as const;
    let extractionSource: "AI_SERVICE" | "BACKEND_FALLBACK" = "AI_SERVICE";
    let extraction: SituationExtraction;
    try {
      extraction = await this.ai.analyzeSituation({
        description: description ?? "No report text was supplied.",
        sourceId,
        sourceType,
        capturedAt: null,
      });
    } catch {
      extractionSource = "BACKEND_FALLBACK";
      extraction = this.fallbackExtraction(sourceId, sourceType, description);
    }

    const computed = await this.snapshots.compute(missionId, extraction, {});
    const snapshot = await this.persistence.saveAnalysisSnapshot(
      missionId,
      actorId,
      scopeWarehouseId,
      {
        kind: "BASELINE",
        requestId: input.requestId,
        fingerprint: computed.fingerprint,
        input: computed.snapshotInput,
        provenance: {
          extractionSource,
          sourceId,
          sourceType,
          hasSubmittedDescription: Boolean(input.description?.trim()),
        },
        result: computed.analysis,
        modelVersion: computed.analysis.versions.model,
        ruleVersion: computed.analysis.versions.rules,
        geoRegistryVersion: computed.analysis.versions.geoRegistry,
        routingGraphVersion: computed.analysis.versions.routingGraph ?? undefined,
        weatherSnapshotVersion: computed.analysis.versions.weatherSnapshot ?? undefined,
      },
    );
    return { snapshot, analysis: computed.analysis, extractionSource };
  }

  private fallbackExtraction(
    sourceId: string,
    sourceType: "USER_REPORT",
    description: string | null,
  ): SituationExtraction {
    const report = description || "No report text was supplied.";
    return {
      schemaVersion: "situation-extraction.v1",
      facts: [
        {
          id: "fallback-report",
          key: "OTHER",
          provenance: "REPORTED",
          value: report,
          qualifier: "UNSPECIFIED",
          source: { sourceType, sourceId, excerpt: report, capturedAt: null },
        },
      ],
      missingData: [
        {
          key: "AFFECTED_PEOPLE",
          question: "Can xac minh so nguoi bi anh huong?",
          impact: "Chua the tinh nhu cau vat tu khi AI chua san sang.",
        },
        {
          key: "INCIDENT_TYPE",
          question: "Can xac minh loai tinh huong chinh?",
          impact: "Can ap dung dung dinh muc va phuong an.",
        },
      ],
      conflicts: [],
      priorityQuestion: {
        factKey: "AFFECTED_PEOPLE",
        question: "Can xac minh so nguoi bi anh huong?",
        expectedImpact: "Can tinh nhu cau vat tu sau khi co so lieu.",
      },
    };
  }
}
