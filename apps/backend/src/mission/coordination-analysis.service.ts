import { Injectable } from "@nestjs/common";
import { incidentTypeLabel, SituationExtraction } from "@safestock/shared-types";
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
    if (!description) {
      // Nhập tay bằng biểu mẫu: không có câu chữ nào để bóc tách, nhưng CÓ số liệu
      // do chính cán bộ điền. Lấy thẳng số liệu đó làm dữ kiện, nguồn là biểu mẫu,
      // trích dẫn để trống — vì đúng là không có câu nào cả.
      //
      // Trước đây chỗ này gửi câu "No report text was supplied." sang AI rồi hiển
      // thị lại nguyên văn như một dữ kiện đã báo cáo: vừa là tiếng Anh lọt vào
      // giao diện tiếng Việt, vừa dựng lời khai không ai nói. Sau đó tôi chặn thẳng
      // bằng lỗi, nhưng thế lại chặn luôn đường nhập tay hợp lệ — cán bộ điền đủ
      // số người, loại tình huống, địa điểm mà vẫn không lập được tham mưu.
      const computed = await this.snapshots.compute(
        missionId,
        this.extractionFromForm(mission, sourceId, sourceType),
        {},
      );
      return this.persist(missionId, actorId, scopeWarehouseId, input, computed, {
        extractionSource: "BACKEND_FALLBACK",
        sourceId,
        sourceType,
      });
    }

    try {
      extraction = await this.ai.analyzeSituation({
        description,
        sourceId,
        sourceType,
        capturedAt: null,
      });
    } catch {
      extractionSource = "BACKEND_FALLBACK";
      extraction = this.fallbackExtraction(sourceId, sourceType, description);
    }

    const computed = await this.snapshots.compute(missionId, extraction, {});
    return this.persist(missionId, actorId, scopeWarehouseId, input, computed, {
      extractionSource,
      sourceId,
      sourceType,
    });
  }

  /** Lưu snapshot bất biến — dùng chung cho cả đường có lời kể lẫn đường nhập tay. */
  private async persist(
    missionId: string,
    actorId: string,
    scopeWarehouseId: string | null | undefined,
    input: AnalyzeMissionInput,
    computed: Awaited<ReturnType<CoordinationSnapshotService["compute"]>>,
    provenance: {
      extractionSource: "AI_SERVICE" | "BACKEND_FALLBACK";
      sourceId: string;
      sourceType: "USER_REPORT";
    },
  ) {
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
          ...provenance,
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
    return {
      snapshot,
      analysis: computed.analysis,
      extractionSource: provenance.extractionSource,
    };
  }

  /**
   * Dữ kiện lấy thẳng từ biểu mẫu cán bộ đã điền.
   *
   * Hợp đồng bắt mọi dữ kiện phải trích được nguồn, và ở đây nguồn có thật: chính
   * ô nhập cán bộ đã điền. Trích dẫn là nội dung ô đó viết lại nguyên vẹn
   * ("Số người: 100"), không phải một câu văn tôi bịa ra rồi gán cho người dùng.
   * Đây vẫn là dữ liệu ĐÃ BÁO CÁO theo đúng nghĩa: có người chịu trách nhiệm cho
   * từng con số.
   */
  private extractionFromForm(
    mission: {
      incidentType: string;
      affectedPeople: number;
      durationHours: number;
      location: string | null;
    },
    sourceId: string,
    sourceType: "USER_REPORT",
  ): SituationExtraction {
    const from = (excerpt: string) => ({ sourceType, sourceId, excerpt, capturedAt: null });
    const facts: SituationExtraction["facts"] = [
      {
        id: "form-incident-type",
        key: "INCIDENT_TYPE",
        provenance: "REPORTED",
        value: mission.incidentType,
        qualifier: "EXACT",
        source: from(`Loại tình huống: ${incidentTypeLabel(mission.incidentType)}`),
      },
      {
        id: "form-affected-people",
        key: "AFFECTED_PEOPLE",
        provenance: "REPORTED",
        value: mission.affectedPeople,
        qualifier: "EXACT",
        source: from(`Số người: ${mission.affectedPeople}`),
      },
      {
        id: "form-duration-hours",
        key: "DURATION_HOURS",
        provenance: "REPORTED",
        value: mission.durationHours,
        qualifier: "EXACT",
        source: from(`Số giờ dự kiến: ${mission.durationHours}`),
      },
    ];
    const location = mission.location?.trim();
    if (location) {
      facts.push({
        id: "form-location",
        key: "LOCATION",
        provenance: "REPORTED",
        value: location,
        qualifier: "EXACT",
        source: from(`Địa điểm ứng phó: ${location}`),
      });
    }
    return {
      schemaVersion: "situation-extraction.v1",
      facts,
      missingData: [
        {
          key: "OTHER",
          question: "Cần mô tả diễn biến thực tế tại hiện trường?",
          impact: "Có lời kể thì mới bóc tách được nhóm dễ tổn thương và nguy cơ cô lập.",
        },
      ],
      conflicts: [],
      priorityQuestion: {
        factKey: "OTHER",
        question: "Cần mô tả diễn biến thực tế tại hiện trường?",
        expectedImpact: "Cần lời kể để bổ sung dữ kiện ngoài các con số đã nhập.",
      },
    };
  }

  /** AI không gọi được: vẫn giữ nguyên lời kể làm dữ kiện, không suy diễn thêm. */
  private fallbackExtraction(
    sourceId: string,
    sourceType: "USER_REPORT",
    description: string,
  ): SituationExtraction {
    return {
      schemaVersion: "situation-extraction.v1",
      facts: [
        {
          id: "fallback-report",
          key: "OTHER",
          provenance: "REPORTED",
          value: description,
          qualifier: "UNSPECIFIED",
          source: { sourceType, sourceId, excerpt: description, capturedAt: null },
        },
      ],
      missingData: [
        {
          key: "AFFECTED_PEOPLE",
          question: "Cần xác minh số người bị ảnh hưởng?",
          impact: "Chưa thể tính nhu cầu vật tư khi AI chưa sẵn sàng.",
        },
        {
          key: "INCIDENT_TYPE",
          question: "Cần xác minh loại tình huống chính?",
          impact: "Cần áp dụng đúng định mức và phương án.",
        },
      ],
      conflicts: [],
      priorityQuestion: {
        factKey: "AFFECTED_PEOPLE",
        question: "Cần xác minh số người bị ảnh hưởng?",
        expectedImpact: "Cần tính nhu cầu vật tư sau khi có số liệu.",
      },
    };
  }
}
