import { Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "crypto";
import {
  CoordinationFactKey,
  incidentTypeLabel,
  SituationExtraction,
} from "@safestock/shared-types";
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
  private readonly log = new Logger(CoordinationAnalysisService.name);

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

    const computed = await this.snapshots.compute(
      missionId,
      this.groundInForm(mission, extraction, sourceId, sourceType),
      {},
    );
    return this.persist(missionId, actorId, scopeWarehouseId, input, computed, {
      extractionSource,
      sourceId,
      sourceType,
    });
  }

  /**
   * Tính lại bản tham mưu sau khi bộ vật tư của nhiệm vụ đổi — KHÔNG gọi lại AI.
   *
   * Bản tham mưu là một ẢNH CHỤP bất biến, nên sau khi ADMIN thêm / sửa / xoá một
   * dòng vật tư thì bảng "Điều phối nội xã" trong đó vẫn kể lại phân bổ của bộ số
   * cũ: nó nói kho Long Châu chuẩn bị ba thứ trong khi một thứ vừa bị bỏ khỏi
   * phương án, hoặc bỏ sót thứ vừa được thêm vào. Khối "Khả năng đáp ứng" ngay
   * bên dưới thì đọc thẳng từ bản ghi nhiệm vụ nên nó đổi ngay — và hai khối cạnh
   * nhau nói hai điều khác nhau về cùng một nhiệm vụ, không có gì trên màn hình
   * cho biết bên nào mới là bên đang có hiệu lực.
   *
   * Cách chữa là chụp một ảnh MỚI, không phải sửa ảnh cũ: ảnh cũ vẫn nằm nguyên
   * trong lịch sử để truy vết "lúc ấy phương án là gì".
   *
   * Dùng lại đúng phần AI đã bóc từ lời kể ở ảnh trước — lời kể không đổi khi
   * người ta sửa số thùng mì, nên gọi lại LLM chỉ tốn một lượt chạy hai chục giây
   * để nhận về cùng bộ dữ kiện, và tệ hơn là nhận về một bộ HƠI KHÁC. Phần thay
   * đổi thật (nhu cầu, phân bổ kho, tuyến, mức đáp ứng) đều do hệ thống tính, và
   * `compute` tính lại toàn bộ từ bản ghi nhiệm vụ vừa sửa.
   *
   * Chưa từng có bản tham mưu nào thì không có gì để tính lại: trả `null`, vì sinh
   * một bản đầu tiên ở đây là lập tham mưu sau lưng người dùng.
   */
  async recomputeAfterRequirementChange(
    missionId: string,
    actorId: string,
    scopeWarehouseId: string | null | undefined,
  ) {
    const snapshots = await this.persistence.listAnalysisSnapshots(
      missionId,
      actorId,
      scopeWarehouseId,
    );
    const baseline = snapshots.find((snapshot) => snapshot["kind"] === "BASELINE");
    if (!baseline) return null;
    const previousInput = baseline["input"] as { extraction?: unknown } | null;
    const extraction = previousInput?.extraction;
    if (!extraction) return null;

    const previousProvenance = (baseline["provenance"] ?? {}) as Record<string, unknown>;
    const extractionSource =
      previousProvenance["extractionSource"] === "AI_SERVICE" ? "AI_SERVICE" : "BACKEND_FALLBACK";
    const computed = await this.snapshots.compute(missionId, extraction, {});
    return this.persist(
      missionId,
      actorId,
      scopeWarehouseId,
      // Khoá riêng mỗi lượt: hai lần sửa vật tư liên tiếp là hai ảnh chụp khác
      // nhau, dùng chung khoá thì lượt sau bị nhận nhầm là gửi lại lượt trước.
      { requestId: `requirement-change-${randomUUID()}` },
      computed,
      {
        extractionSource,
        sourceId: missionId,
        sourceType: "USER_REPORT",
      },
    );
  }

  /**
   * Bọc `recomputeAfterRequirementChange` để một lỗi ở đây không nuốt mất việc đã làm xong.
   *
   * Vật tư đã được ghi xuống nhiệm vụ TRƯỚC khi hàm này chạy. Ném lỗi ra ngoài
   * thì màn hình báo "không cập nhật được vật tư" trong khi vật tư đã đổi thật —
   * và người dùng bấm lại, sửa thêm một lần nữa lên bộ số đã sửa.
   *
   * Hỏng ở đây chỉ có nghĩa là bảng điều phối trong bản tham mưu còn kể chuyện cũ,
   * đúng như trước khi có hàm này; lượt sửa sau hoặc nút lập lại tham mưu sẽ dựng
   * lại nó.
   */
  async tryRecomputeAfterRequirementChange(
    missionId: string,
    actorId: string,
    scopeWarehouseId: string | null | undefined,
  ) {
    try {
      await this.recomputeAfterRequirementChange(missionId, actorId, scopeWarehouseId);
    } catch (error) {
      this.log.warn(
        `Không tính lại được bản tham mưu sau khi sửa vật tư của nhiệm vụ ${missionId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /** Bốn dữ kiện thuộc quyền của biểu mẫu: AI đọc lời kể, người điều phối mới quyết. */
  private static readonly FORM_OWNED_KEYS: ReadonlySet<CoordinationFactKey> = new Set([
    "INCIDENT_TYPE",
    "AFFECTED_PEOPLE",
    "DURATION_HOURS",
    "LOCATION",
  ]);

  /**
   * Đặt số liệu biểu mẫu lên trên phần AI bóc ra từ lời kể.
   *
   * Trước đây có lời kể là toàn bộ dữ kiện lấy theo lời kể. Cán bộ sửa địa điểm
   * ứng phó từ Tân An sang Long Bình rồi bấm "Lập bản tham mưu" thì bản tham mưu
   * vẫn ghi Tân An — vì AI đọc lại đúng câu cũ. Nhìn từ ngoài, ô địa điểm trở
   * thành ô trang trí: sửa được nhưng không đổi được gì.
   *
   * Phân vai đúng phải là: AI chỉ bóc lời kể thành số để ĐIỀN VÀO FORM, còn khi
   * lập tham mưu thì form là bản gốc. Phần AI đọc thêm được mà form không có
   * (nguy cơ cô lập, nhóm dễ tổn thương…) vẫn giữ nguyên — đó mới là chỗ nó thêm
   * giá trị.
   */
  private groundInForm(
    mission: {
      incidentType: string;
      affectedPeople: number;
      durationHours: number;
      location: string | null;
    },
    extraction: SituationExtraction,
    sourceId: string,
    sourceType: "USER_REPORT",
  ): SituationExtraction {
    const formFacts = this.extractionFromForm(mission, sourceId, sourceType).facts;
    // Chỉ những khoá form THẬT SỰ có số liệu mới đè. Địa điểm bỏ trống thì giữ
    // lấy phần AI đọc được, còn hơn là không có gì.
    const ownedKeys = new Set<CoordinationFactKey>(formFacts.map((fact) => fact.key));
    const dropped = new Set(
      extraction.facts.filter((fact) => ownedKeys.has(fact.key)).map((fact) => fact.id),
    );
    // Suy luận dựa trên một dữ kiện vừa bị thay thì mất luôn chỗ dựa: giữ lại là
    // treo một kết luận lên câu chữ mà biểu mẫu đã phủ nhận. Bỏ theo dây chuyền —
    // và hợp đồng dữ liệu cũng bắt basisFactIds phải trỏ vào dữ kiện còn tồn tại.
    let facts = extraction.facts.filter((fact) => !dropped.has(fact.id));
    for (let changed = true; changed; ) {
      changed = false;
      facts = facts.filter((fact) => {
        const orphan =
          fact.provenance === "AI_INFERENCE" && fact.basisFactIds.some((id) => dropped.has(id));
        if (orphan) {
          dropped.add(fact.id);
          changed = true;
        }
        return !orphan;
      });
    }
    // Form đã điền thì không còn là "thiếu dữ liệu", và cũng không còn gì để hỏi.
    const missingData = extraction.missingData.filter((item) => !ownedKeys.has(item.key));
    const conflicts = extraction.conflicts
      .filter((conflict) => !ownedKeys.has(conflict.key))
      .map((conflict) => ({
        ...conflict,
        factIds: conflict.factIds.filter((id) => !dropped.has(id)),
      }))
      .filter((conflict) => conflict.factIds.length > 0);
    const priorityQuestion =
      extraction.priorityQuestion && !ownedKeys.has(extraction.priorityQuestion.factKey)
        ? extraction.priorityQuestion
        : missingData.length > 0
          ? {
              factKey: missingData[0].key,
              question: missingData[0].question,
              expectedImpact: missingData[0].impact,
            }
          : null;
    return {
      schemaVersion: extraction.schemaVersion,
      facts: [...formFacts, ...facts],
      missingData,
      conflicts,
      priorityQuestion,
    };
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
