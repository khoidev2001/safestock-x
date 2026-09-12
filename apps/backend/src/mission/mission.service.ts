import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import {
  DeliveryOutcome,
  MissionStatus,
  MissionWarehouseRequestStatus,
  NotificationKind,
  LoanStatus,
  Prisma,
  UserRole,
} from "@prisma/client";
import { FIELD_FORCE_ROLE_LABEL, IncidentType, incidentTypeLabel } from "@safestock/shared-types";
import { AiClientService } from "../ai/ai-client.service";
import { LatLng } from "../geo/haversine";
import { LocalRoutingService } from "../geo/local-routing.service";
import { InventoryService } from "../inventory/inventory.service";
import { assertWarehouseInScope } from "../inventory/warehouse-scope";
import { NotificationService, type CreateNotification } from "../notification/notification.service";
import { PrismaService } from "../prisma/prisma.service";
import { ReadinessService } from "../readiness/readiness.service";
import { assessBatchEligibility } from "./batch-eligibility";
import {
  decodeDeliveryPhotos,
  optimizeDeliveryPhoto,
  type DecodedDeliveryPhoto,
  type DeliveryPhotoInput,
} from "./delivery-photos";
import { EvidenceStorageService } from "./evidence-storage.service";
import { EXPORTED_REQUEST_STATUSES, isRequestExported } from "./mission-request-status";
import {
  commitmentKey,
  commitmentMap,
  shortfallMessage,
  subtractCommitments,
  type Shortfall,
} from "./mission-commitments";
import { assertTransition } from "./mission.workflow";
import {
  ActionPlan,
  ActionPlanNarrative,
  AllocationSummary,
  buildTemplateNarrative,
  computeForecasts,
  scoreSeverity,
  WarehouseEta,
} from "./action-plan";
import {
  allocateGreedy,
  AvailableBatch,
  computeRequirements,
  countVulnerablePeople,
  IncidentInput,
  Requirement,
} from "./mission.compute";
import {
  assessMissionReadiness,
  MissionReadinessAssessment,
  withCurrentFulfillment,
} from "./mission-readiness";
import { normalizeHamletName } from "../admin/hamlet-normalization";
import { findHamletInReport } from "./hamlet-in-report";
import { readReportSignal } from "./report-signal";
import { decodeReportAudio } from "./report-audio";
import { buildWarehouseRequestCreates, requestBatchItems } from "./mission-warehouse-request";

/**
 * Trần cho số lượng nhu cầu ADMIN gõ tay vào bản tham mưu.
 *
 * Không phải giới hạn nghiệp vụ — không xã nào cần một triệu áo phao — mà là chốt
 * chặn gõ nhầm: thêm vài số 0 vào ô số lượng thì phép phân bổ vẫn chạy đúng nhưng
 * mức đáp ứng tụt về gần 0 và nhiệm vụ bị khoá là "chưa thể điều phối", trong khi
 * kho thật ra vẫn đủ hàng.
 */
const MAX_REQUIREMENT_QUANTITY = 1_000_000;

/** Gợi ý mượn kho lân cận cho 1 SKU thiếu. */
interface NeighborSuggestion {
  name: string;
  distanceKm: number;
  available: number;
}

/**
 * Đếm bản tham mưu gốc của nhiệm vụ, để client biết nhiệm vụ đã qua bước đó chưa.
 *
 * `MissionStatus` đứng yên ở DRAFT suốt ba bước đầu (khai số liệu → lập tham mưu
 * → lập kế hoạch cứu hộ), nên chỉ nhìn `status` thì cả ba bước đều hiện "Bản
 * nháp" — người trực không biết nhiệm vụ đã đi tới đâu và bấm lại việc vừa làm.
 *
 * Đếm thay vì `include` cả snapshot: bản tham mưu là một khối JSON lớn, mà danh
 * sách trả về tới 100 nhiệm vụ. Ở đây chỉ cần biết CÓ hay KHÔNG.
 *
 * Chỉ tính BASELINE — WHAT_IF là bản thử tình huống giả định, không phải bản
 * tham mưu đã chốt của nhiệm vụ.
 */
const COORDINATION_ANALYSIS_COUNT = {
  _count: { select: { analysisSnapshots: { where: { kind: "BASELINE" as const } } } },
} as const;

/** Đổi số đếm thành cờ boolean, và giấu `_count` đi khỏi payload trả cho client. */
function withCoordinationAnalysisFlag<T extends { _count?: { analysisSnapshots: number } }>(
  mission: T,
): Omit<T, "_count"> & { hasCoordinationAnalysis: boolean } {
  const { _count, ...rest } = mission;
  return { ...rest, hasCoordinationAnalysis: (_count?.analysisSnapshots ?? 0) > 0 };
}

/** Bốn cách xếp mà hộp nhiệm vụ cho chọn. Khớp `MissionInboxSort` phía web. */
export type MissionListSort = "newest" | "oldest" | "most-people" | "fewest-people";
/** Ô tìm kiếm đang nhắm vào trường nào. */
export type MissionSearchField = "text" | "mission-no" | "affected-people";

/** Lọc theo phần việc, khớp `MissionInboxFilter` phía web. */
export type MissionListFilter = "all" | "needs-action" | "published";

/** Trần mỗi trang — chặn một request xin 100.000 dòng kéo sập bộ nhớ. */
const MAX_PAGE_SIZE = 100;

/**
 * Trạng thái nào là "đang chờ chính vai này xử lý".
 *
 * Bản sao ở backend của `missionNeedsAction` phía web, cho phần lọc được ở tầng
 * SQL. Chỉ lọc được phần theo TRẠNG THÁI: với kho còn một điều kiện nữa là "phần
 * phân bổ của kho mình chưa xuất", điều kiện đó ghép riêng vào mệnh đề where.
 */
export function needsActionStatuses(role: UserRole): MissionStatus[] {
  if (role === UserRole.ADMIN) {
    return [MissionStatus.DRAFT, MissionStatus.REJECTED, MissionStatus.DEFERRED];
  }
  if (role === UserRole.WAREHOUSE) return [MissionStatus.PENDING_WAREHOUSE];
  // Lực lượng hiện trường chỉ đọc — không có hành động điều phối nào để làm.
  return [];
}

/**
 * Thứ tự SQL cho từng cách xếp, luôn chốt cuối bằng SỐ HIỆU.
 *
 * `createdAt` trùng nhau là chuyện có thật — dữ liệu hiện tại đã có hai nhiệm vụ
 * cùng phút. Giữa các dòng hoà nhau thì Postgres không hứa hẹn thứ tự nào, nên
 * hai lượt hỏi có thể trả hai thứ tự khác nhau; với phân trang thì một nhiệm vụ
 * hiện ở cả trang 1 lẫn trang 2 trong khi một nhiệm vụ khác không xuất hiện ở
 * đâu cả. Số hiệu là duy nhất nên nó cắt mọi thế hoà.
 */
export function missionOrderBy(sort: MissionListSort): Prisma.MissionOrderByWithRelationInput[] {
  switch (sort) {
    case "oldest":
      return [{ createdAt: "asc" }, { missionNo: "asc" }];
    case "most-people":
      return [{ affectedPeople: "desc" }, { createdAt: "desc" }, { missionNo: "desc" }];
    case "fewest-people":
      return [{ affectedPeople: "asc" }, { createdAt: "desc" }, { missionNo: "desc" }];
    case "newest":
    default:
      return [{ createdAt: "desc" }, { missionNo: "desc" }];
  }
}

/**
 * Kho khai số vật tư tái sử dụng đã nhận lại.
 *
 * Bỏ trống `items` nghĩa là "về đủ hết" — đường một nút bấm, giữ nguyên như trước.
 * Có `items` là kho đếm từng dòng, và dòng nào còn thiếu thì nhiệm vụ chưa khép.
 */
export interface SupplyReturnInput {
  items?: { sku: string; returnedQuantity: number }[];
}

@Injectable()
export class MissionService {
  private readonly log = new Logger(MissionService.name);

  constructor(
    private prisma: PrismaService,
    private ai: AiClientService,
    private notifications: NotificationService,
    private inventory: InventoryService,
    private readiness: ReadinessService,
    private localRouting: LocalRoutingService,
    private evidenceStorage: EvidenceStorageService,
  ) {}

  /**
   * Lập phương án (BE-D2 + K1): tình huống → nhu cầu (định mức) → phân bổ greedy
   * ưu tiên kho GẦN điểm nạn trong cụm xã (kho thôn gần trước, tràn kho tổng) →
   * gợi ý kho lân cận (xã khác) nếu vẫn thiếu → lưu Mission trạng thái DRAFT.
   */
  async generatePlan(
    warehouseId: string,
    incident: IncidentInput,
    userId?: string,
    incidentPoint?: LatLng,
    scopeWarehouseId?: string | null,
    /**
     * Lời kể gốc của cán bộ, giữ nguyên văn.
     *
     * Không giữ thì nhiệm vụ lập từ form chỉ còn các con số đã bóc tách: bản tham
     * mưu về sau không còn câu nào để trích dẫn nguồn, mà mọi dữ kiện trong đó
     * đều bắt buộc phải chỉ ra được câu chữ đã sinh ra nó.
     */
    reportText?: string,
  ) {
    await this.assertWarehouseAccess(warehouseId, userId, scopeWarehouseId);
    // Lớp bóc tách bắt địa điểm bằng cụm đứng sau chữ "thôn", nên câu nói tự
    // nhiên như "lũ lụt ở tân bình, cô lập 120 người" thì nó không thấy gì. Trước
    // khi chịu thua, dò thẳng danh mục thôn đã xác minh ngay trong lời kể — đối
    // chiếu với tên có thật thì không có chỗ cho đoán sai.
    const location =
      incident.location?.trim() || (await this.hamletFromReport(warehouseId, reportText));
    const resolved = await this.resolveIncidentLocation(warehouseId, location, incidentPoint);
    const plan = await this.computePlan(warehouseId, incident, resolved.point);
    return this.prisma.mission.create({
      data: {
        warehouseId,
        incidentType: incident.incidentType,
        location: resolved.name ?? incident.location ?? null,
        affectedPeople: incident.affectedPeople,
        durationHours: incident.durationHours,
        priority: "MEDIUM",
        parsedInput: incident as unknown as Prisma.InputJsonValue,
        reportText: reportText?.trim() || null,
        status: MissionStatus.DRAFT,
        fulfillment: plan.fulfillment,
        readinessAssessment: plan.readinessSnapshot,
        hamletId: resolved.hamletId,
        hamletName: resolved.name,
        incidentLat: resolved.point?.lat,
        incidentLng: resolved.point?.lng,
        requirements: { create: this.buildRequirementCreates(plan.allocations, plan.neighbors) },
      },
      include: { requirements: true },
    });
  }

  /**
   * Admin phân tích một BÁO CÁO của trưởng thôn (report draft) → tính nhu cầu +
   * phân bổ NGAY TRÊN mission đó (update in-place), KHÔNG tạo mission mới. Nhờ vậy
   * một báo cáo = một nhiệm vụ, không đẻ DRAFT mồ côi; `reportText` giữ nguyên để
   * đối chiếu. Chỉ áp dụng khi mission còn ở trạng thái nháp. Toạ độ ưu tiên điểm
   * admin ghim; không có thì dùng lại toạ độ trưởng thôn gửi kèm (nếu có).
   */
  async planFromReport(
    missionId: string,
    incident: IncidentInput,
    incidentPoint?: LatLng,
    actorUserId?: string,
    scopeWarehouseId?: string | null,
  ) {
    const draft = await this.getMission(missionId, actorUserId, scopeWarehouseId);
    if (!draft) throw new NotFoundException("Không tìm thấy báo cáo");
    if (draft.status !== MissionStatus.DRAFT) {
      throw new BadRequestException("Chỉ phân tích được báo cáo ở trạng thái nháp");
    }
    const existingPoint =
      draft.incidentLat != null && draft.incidentLng != null
        ? { lat: draft.incidentLat, lng: draft.incidentLng }
        : undefined;
    const resolved = await this.resolveIncidentLocation(
      draft.warehouseId,
      incident.location,
      incidentPoint ?? existingPoint,
    );
    const point = resolved.point;
    const plan = await this.computePlan(draft.warehouseId, incident, point);
    return this.prisma.$transaction(async (tx) => {
      // Claim có điều kiện trước mọi mutation requirement: dispatch thắng race thì không ghi đè.
      const claimed = await tx.mission.updateMany({
        where: { id: missionId, status: MissionStatus.DRAFT },
        data: {
          incidentType: incident.incidentType,
          location: resolved.name ?? incident.location ?? draft.location,
          affectedPeople: incident.affectedPeople,
          durationHours: incident.durationHours,
          parsedInput: incident as unknown as Prisma.InputJsonValue,
          fulfillment: plan.fulfillment,
          readinessAssessment: plan.readinessSnapshot,
          incidentLat: point?.lat ?? null,
          incidentLng: point?.lng ?? null,
          hamletId: resolved.hamletId ?? draft.hamletId,
          hamletName: resolved.name ?? draft.hamletName,
          actionPlan: Prisma.DbNull,
          explanation: null,
        },
      });
      if (claimed.count === 0) {
        const current = await tx.mission.findUnique({ where: { id: missionId } });
        if (!current) throw new NotFoundException("Không tìm thấy báo cáo");
        throw new BadRequestException("Chỉ phân tích được báo cáo ở trạng thái nháp");
      }

      // Re-plan thay toàn bộ phân bổ cũ sau khi đã giữ được trạng thái DRAFT.
      await tx.missionRequirement.deleteMany({ where: { missionId } });
      await tx.mission.update({
        where: { id: missionId },
        data: {
          requirements: { create: this.buildRequirementCreates(plan.allocations, plan.neighbors) },
        },
      });
      return tx.mission.findUniqueOrThrow({
        where: { id: missionId },
        include: { requirements: true },
      });
    });
  }

  /**
   * Tính nhu cầu + phân bổ greedy cho một tình huống tại một kho — phần dùng chung
   * giữa lập phương án mới (generatePlan) và phân tích báo cáo (planFromReport).
   * Chặn sớm nếu kho đang có blocker vận hành (NOT_DISPATCHABLE).
   */
  private async computePlan(
    warehouseId: string,
    incident: IncidentInput,
    incidentPoint?: LatLng,
    /**
     * Nhiệm vụ đang được tính lại — phần nó đã hứa KHÔNG tính là bận.
     *
     * Không loại ra thì lượt tính lại tự trừ chính mình: nhiệm vụ đang giữ 10 áo
     * phao sẽ thấy kho trống trơn và kết luận không đủ hàng, dù chưa ai lấy mất
     * gì cả.
     */
    replanningMissionId?: string,
  ) {
    const warehouse = await this.prisma.warehouse.findUnique({ where: { id: warehouseId } });
    if (!warehouse) throw new NotFoundException("Không tìm thấy kho");

    const warehouseReadiness = await this.readiness.getWarehouseScore(warehouseId);
    if (warehouseReadiness?.operationalStatus === "NOT_DISPATCHABLE") {
      const reason = warehouseReadiness.blockers[0]?.title ?? "Kho có blocker vận hành";
      throw new BadRequestException(
        `Kho chưa thể lập phương án mới: ${reason}. Cần xử lý nguyên nhân trước.`,
      );
    }

    const requirements = computeRequirements(incident);
    const batchPool = await this.loadClusterBatches(
      warehouse.organizationId,
      warehouse.communeId,
      requirements.map((requirement) => requirement.sku),
      incidentPoint,
      replanningMissionId,
    );
    const neighbors = await this.prisma.neighborWarehouse.findMany({ where: { warehouseId } });

    const allocations = requirements.map((req) => allocateGreedy(req, batchPool.available));
    const readinessAssessment = assessMissionReadiness(
      allocations,
      batchPool.unavailableReasonsBySku,
    );
    return {
      allocations,
      neighbors,
      fulfillment: readinessAssessment.fulfillment,
      readinessSnapshot: {
        ...readinessAssessment,
        warehouseOperationalStatus: warehouseReadiness?.operationalStatus ?? null,
      } as unknown as Prisma.InputJsonValue,
    };
  }

  /** Chuyển danh sách phân bổ → payload tạo MissionRequirement (dùng chung create/update). */
  private buildRequirementCreates(
    allocations: ReturnType<typeof allocateGreedy>[],
    neighbors: { name: string; distanceKm: number; summary: Prisma.JsonValue }[],
  ): Prisma.MissionRequirementCreateWithoutMissionInput[] {
    return allocations.map((alloc) => ({
      sku: alloc.sku,
      itemName: alloc.itemName,
      required: alloc.required,
      allocated: alloc.allocated,
      shortage: alloc.shortage,
      unit: alloc.unit,
      allocations: alloc.batches as unknown as Prisma.InputJsonValue,
      neighborSuggestion:
        alloc.shortage > 0
          ? (this.suggestNeighbors(
              alloc.sku,
              alloc.shortage,
              neighbors,
            ) as unknown as Prisma.InputJsonValue)
          : Prisma.JsonNull,
    }));
  }

  /**
   * Trưởng thôn (mobile) báo cáo tình huống → tạo Mission DRAFT "hộp thư": chỉ lưu
   * mô tả THÔ (`reportText`) + toạ độ + người báo, KHÔNG parse / phân bổ ở đây.
   * Admin mở tin trên web mới chạy phân tích AI (tái dùng generatePlan). Trả mission.
   */
  async createReportDraft(input: {
    warehouseId: string;
    /** Có thể trống khi người báo chỉ gửi file ghi âm. */
    description?: string;
    userId?: string;
    requestId?: string;
    incidentPoint?: LatLng;
    audio?: { base64: string; mimeType: string; durationMs?: number };
  }) {
    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id: input.warehouseId },
    });
    if (!warehouse) throw new NotFoundException("Không tìm thấy kho tiếp nhận báo cáo");

    // parsedInput placeholder — chưa phân tích; web sẽ ghi đè khi lập phương án.
    const placeholder: IncidentInput = {
      incidentType: IncidentType.OTHER,
      affectedPeople: 0,
      durationHours: 24,
      children: 0,
      elderly: 0,
      medicalSupportCases: 0,
    };
    const description = input.description?.trim() ?? "";
    // Thẻ thông báo của admin phải nói được việc gì dù báo cáo không có chữ nào:
    // một dòng trống trên thẻ đọc thành "hệ thống lỗi", chứ không thành "hãy mở
    // ra nghe".
    const excerpt = description
      ? description.length > 140
        ? `${description.slice(0, 140)}…`
        : description
      : "Báo cáo bằng giọng nói — mở để nghe.";
    // Đọc thẳng lời kể để thẻ thông báo của ADMIN có biểu tượng đúng loại thiên
    // tai, số người và tên thôn NGAY lúc nhận. Bản ghi nhiệm vụ lúc này vẫn là
    // chỗ trống (OTHER, 0 người) và cố ý giữ nguyên như vậy: ADMIN vẫn phải bấm
    // phân tích rồi xác nhận. Đây chỉ là nhãn cho một thẻ báo, không phải số
    // liệu để tính vật tư.
    const hamlets = await (this.prisma as unknown as MissionHamletPrisma).hamlet.findMany({
      where: { organizationId: warehouse.organizationId, communeId: warehouse.communeId },
    });
    const signal = readReportSignal(description, hamlets);
    const decoded = decodeReportAudio(input.audio);
    // Chặn TRƯỚC khi tạo nhiệm vụ: tạo xong mới báo lỗi thì hộp thư của admin có
    // một báo cáo mà người gửi tin là đã hỏng, và họ sẽ gửi lại lần nữa.
    if (!decoded.ok) throw new BadRequestException(decoded.message);
    const audio = decoded.audio;

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const mission = await tx.mission.create({
          data: {
            warehouseId: input.warehouseId,
            incidentType: placeholder.incidentType,
            affectedPeople: placeholder.affectedPeople,
            durationHours: placeholder.durationHours,
            priority: "MEDIUM",
            parsedInput: placeholder as unknown as Prisma.InputJsonValue,
            reportText: description || null,
            status: MissionStatus.DRAFT,
            incidentLat: input.incidentPoint?.lat,
            incidentLng: input.incidentPoint?.lng,
            createdByUserId: input.userId,
            reportRequestId: input.requestId,
          },
        });
        /*
          Ghi âm nằm TRONG cùng transaction với nhiệm vụ.
          
          Ghi ngoài rồi mới nối vào là mở ra cửa cho hai kết cục dở: báo cáo có
          mà file mất (người điều phối thấy nút nghe rồi bấm vào lỗi), hoặc file
          có mà báo cáo không (một đống byte không ai biết của ai). Cùng một
          transaction thì hoặc cả hai, hoặc không gì cả.
        */
        if (audio) {
          await tx.missionReportAudio.create({
            data: {
              missionId: mission.id,
              data: audio.buffer,
              mimeType: audio.mimeType,
              byteSize: audio.buffer.length,
              durationMs: input.audio?.durationMs ?? null,
            },
          });
        }
        const notification = await tx.notification.create({
          data: {
            recipientRole: UserRole.ADMIN,
            kind: NotificationKind.INCIDENT_REPORTED,
            title: "Báo cáo mới từ trưởng thôn",
            body: excerpt,
            missionId: mission.id,
            // Số hiệu phải truyền tay ở mọi lệnh tạo nằm TRONG transaction: chúng
            // không đi qua NotificationService nên phần tự chép ở đó không chạm tới.
            missionNo: mission.missionNo,
            warehouseId: input.warehouseId,
            organizationId: warehouse.organizationId,
            ...signal,
          },
        });
        return { mission, notification };
      });

      // Chỉ push sau khi cả Mission và Notification đã commit thành công.
      this.notifications.pushPersisted(result.notification);
      return result.mission;
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== "P2002" ||
        !input.userId ||
        !input.requestId
      ) {
        throw error;
      }

      // Concurrent retry thắng unique key: trả report đã commit, không tạo/push notification lần hai.
      const existing = await this.prisma.mission.findFirst({
        where: {
          createdByUserId: input.userId,
          reportRequestId: input.requestId,
        },
      });
      if (!existing) throw error;
      return existing;
    }
  }

  /**
   * Chọn kho tiếp nhận báo cáo: ưu tiên kho scope của trưởng thôn → kho chỉ định →
   * kho TỔNG (CENTRAL) của xã → kho bất kỳ. Không có kho nào → ném NotFound.
   *
   * BẮT BUỘC cùng organization với người báo cáo: kho scope, kho chỉ định và kho
   * mặc định đều phải thuộc tổ chức của actor. Chặn trưởng thôn không-scope (toàn xã)
   * hoặc client độc hại ghi báo cáo sang kho của tổ chức khác (cross-tenant).
   */
  async resolveReportWarehouseId(
    actorUserId: string,
    scopeWarehouseId?: string | null,
    requestedId?: string,
  ) {
    const actor = await this.prisma.user.findUnique({
      where: { id: actorUserId },
      select: { organizationId: true },
    });
    if (!actor) throw new NotFoundException("Không tìm thấy người báo cáo");

    // Trưởng thôn có scope kho: luôn dùng đúng kho scope, không cho ghi đè sang kho khác.
    if (scopeWarehouseId) {
      const scoped = await this.prisma.warehouse.findFirst({
        where: { id: scopeWarehouseId, organizationId: actor.organizationId },
        select: { id: true },
      });
      if (!scoped) throw new NotFoundException("Kho scope không thuộc tổ chức của người báo cáo");
      return scoped.id;
    }

    // Người báo cáo toàn xã chỉ định kho: kho phải cùng organization.
    if (requestedId) {
      const requested = await this.prisma.warehouse.findFirst({
        where: { id: requestedId, organizationId: actor.organizationId },
        select: { id: true },
      });
      if (!requested)
        throw new NotFoundException("Kho tiếp nhận không thuộc tổ chức của người báo cáo");
      return requested.id;
    }

    // Mặc định: kho TỔNG (CENTRAL) trong đúng organization → kho bất kỳ cùng org.
    const central = await this.prisma.warehouse.findFirst({
      where: { kind: "CENTRAL", organizationId: actor.organizationId },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (central) return central.id;
    const any = await this.prisma.warehouse.findFirst({
      where: { organizationId: actor.organizationId },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (!any) throw new NotFoundException("Chưa có kho nào để tiếp nhận báo cáo");
    return any.id;
  }

  async getMission(id: string, actorUserId?: string, scopeWarehouseId?: string | null) {
    const mission = await this.prisma.mission.findUnique({
      where: { id },
      include: {
        requirements: true,
        warehousePreparations: true,
        warehouseRequests: {
          include: { warehouse: { select: { id: true, name: true } } },
          orderBy: [{ warehouseId: "asc" }, { sku: "asc" }],
        },
        // Một xã có nhiều quản trị viên cùng duyệt, nên "ai đã duyệt" là thông
        // tin điều hành thật: người trực cần biết gọi ai để hỏi lại phương án.
        approvedBy: { select: { id: true, fullName: true, email: true } },
        /**
         * Người GỬI nhiệm vụ này lên — trưởng thôn báo tình huống, hoặc lực lượng
         * hiện trường báo từ hiện trường.
         *
         * Cùng một xã có mười mấy thôn cùng báo về trong một trận lũ; số hiệu
         * nhiệm vụ không nói được tin nào từ ai, nên người trực muốn hỏi lại một
         * chi tiết trong lời kể thì không biết gọi cho ai. `createdByUserId` vốn
         * đã lưu sẵn, chỉ là chưa bao giờ được trả ra.
         */
        createdBy: { select: { id: true, fullName: true, email: true, role: true } },
        // CHỈ phần mô tả, không kèm `data`: mỗi ảnh vài trăm KB, nhét vào JSON
        // chi tiết nhiệm vụ là bắt mọi lượt mở nhiệm vụ tải cả tập ảnh — kể cả
        // lượt của người chỉ liếc trạng thái trên điện thoại giữa vùng sóng yếu.
        deliveryPhotos: {
          select: { id: true, mimeType: true, byteSize: true, createdAt: true },
          orderBy: { createdAt: "asc" },
        },
        // Chỉ phần mô tả, KHÔNG kèm `data` — cùng lý do với ảnh bằng chứng ngay
        // trên. Web cần biết "có ghi âm hay không" để quyết định hiện nút nghe;
        // bytes chỉ tải khi người ta thật sự bấm.
        reportAudio: { select: { id: true, mimeType: true, byteSize: true, durationMs: true } },
        ...COORDINATION_ANALYSIS_COUNT,
      },
    });
    if (!mission) throw new NotFoundException("Không tìm thấy nhiệm vụ");
    assertMissionWarehouseInScope(scopeWarehouseId, mission);
    if (actorUserId) {
      const [actor, warehouse] = await Promise.all([
        this.prisma.user.findUnique({
          where: { id: actorUserId },
          select: { organizationId: true },
        }),
        this.prisma.warehouse.findUnique({
          where: { id: mission.warehouseId },
          select: { organizationId: true },
        }),
      ]);
      if (!actor || !warehouse || actor.organizationId !== warehouse.organizationId)
        throw new NotFoundException("Khong tim thay nhiem vu");
    }
    // Tính lại % đáp ứng theo công thức hiện hành trước khi trả ra. Ảnh chụp
    // đã lưu giữ nguyên các con số phân bổ; chỉ riêng tỉ lệ phần trăm được tính
    // lại, để nhiệm vụ lập từ trước lúc đổi công thức không hiện 0% giữa một
    // bảng toàn dòng "Đủ" — xem `withCurrentFulfillment`.
    const [withFlags] = await this.withReturnableSupplyFlags([
      withCoordinationAnalysisFlag(withCurrentFulfillment(mission)),
    ]);
    return withFlags;
  }

  /**
   * Gắn cờ "nhiệm vụ này có gì để thu hồi không" vào một loạt nhiệm vụ.
   *
   * Có nhiệm vụ chỉ phát đồ tiêu hao — mì tôm, nước đóng chai, lương khô. Phát
   * xong là hết, không ai phải mang gì về kho. Trước đây giao diện không phân
   * biệt được chuyện đó với "có hàng phải trả mà chưa trả", nên kho vẫn bị hỏi
   * "đội hoàn trả vật tư chưa?" và điều phối vẫn thấy một bước treo ở trạng thái
   * chờ, cho một khoản nợ không tồn tại.
   *
   * Đọc đúng theo `listReturnableSupplies` — cùng điều kiện "đội đã ký nhận mang
   * đi" và cùng phép lọc hàng tái sử dụng — để cờ này với danh sách đếm lại
   * không bao giờ nói hai điều khác nhau.
   *
   * Phạm vi TOÀN nhiệm vụ, không theo kho người hỏi: một lượt xác nhận hoàn trả
   * đóng cả nhiệm vụ, nên chừng nào còn một kho có hàng ngoài kia thì nhiệm vụ
   * vẫn cần được trả.
   *
   * Nhận cả MẢNG chứ không phải từng nhiệm vụ một: danh sách trả về tới 100 dòng,
   * mà tra danh mục từng dòng là 100 lượt hỏi cơ sở dữ liệu cho một câu trả lời
   * gộp lại được thành một.
   */
  private async withReturnableSupplyFlags<
    T extends { warehouseRequests?: { sku: string; pickedUpQuantity: number | null }[] | null },
  >(missions: T[]): Promise<(T & { hasReturnableSupplies: boolean })[]> {
    // Chưa ký nhận mang đi thì chưa có gì ở ngoài kho để mà đòi về. Không có phiếu
    // nào cũng vậy — nhiệm vụ cũ từ trước khi tách phiếu theo vật tư không có gì
    // để đòi, và ngã ở đây thì cả lượt mở nhiệm vụ hỏng theo.
    const handedOver = (mission: T) =>
      (mission.warehouseRequests ?? []).filter((request) => (request.pickedUpQuantity ?? 0) > 0);
    const reusable = await this.reusableSkus(
      missions.flatMap((mission) => handedOver(mission).map((request) => request.sku)),
    );
    return missions.map((mission) => ({
      ...mission,
      hasReturnableSupplies: handedOver(mission).some((request) => reusable.has(request.sku)),
    }));
  }

  /**
   * Tên thôn nhắc trong lời kể, đối chiếu với danh mục đã xác minh của chính xã đó.
   *
   * Chỉ dùng khi lớp bóc tách không tìm ra địa điểm. Trả null khi lời kể không
   * nhắc thôn nào, hoặc nhắc từ hai thôn trở lên — lúc đó để ADMIN chỉ định, vì
   * đoán bừa là gửi hàng cứu trợ tới nhầm chỗ.
   */
  private async hamletFromReport(
    warehouseId: string,
    reportText?: string,
  ): Promise<string | undefined> {
    const report = reportText?.trim();
    if (!report) return undefined;
    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id: warehouseId },
      select: { organizationId: true, communeId: true },
    });
    if (!warehouse) return undefined;
    const hamlets = await (this.prisma as unknown as MissionHamletPrisma).hamlet.findMany({
      where: { organizationId: warehouse.organizationId, communeId: warehouse.communeId },
    });
    return findHamletInReport(report, hamlets)?.name;
  }

  /**
   * Resolve exact tên/alias trong đúng organization+xã. Không fuzzy, không sinh tọa độ.
   * Nếu LLM đã trả location thì marker phải tồn tại và đã được ADMIN xác minh.
   */
  private async resolveIncidentLocation(
    warehouseId: string,
    location: string | null | undefined,
    explicitPoint?: LatLng,
  ): Promise<{ hamletId?: string; name?: string; point?: LatLng }> {
    // ĐIỂM GHIM THẮNG VĂN BẢN.
    //
    // Trưởng thôn đứng tại chỗ và ghim đúng điểm trên ảnh vệ tinh: đó là toạ độ
    // CHÍNH XÁC của chỗ đang xảy ra sự việc. Tên thôn trong lời kể chỉ dẫn tới toạ
    // độ điểm ứng phó của cả thôn — thường là nhà văn hoá, cách chỗ ngập thật vài
    // trăm mét đến vài km. Bản trước ưu tiên tên thôn, nên ghim xong vẫn bị thay
    // bằng tâm thôn: người báo thấy điểm mình ghim biến mất, và tuyến tính ra là
    // đường tới nhà văn hoá chứ không tới chỗ cần cứu.
    //
    // Không suy ra `hamletId`/`hamletName` từ điểm ghim: bảng thôn chỉ có MỘT toạ
    // độ mỗi thôn, không có ranh giới, nên "thôn gần nhất" là phỏng đoán. Để trống
    // và giữ lời kể làm nhãn thì bản ghi nói đúng những gì hệ thống biết chắc.
    if (explicitPoint) return { point: explicitPoint };

    // Không có điểm ghim thì mới tra tên thôn. Không bịa toạ độ, không geocode.
    if (!location?.trim()) {
      throw new BadRequestException(
        "Cần xác nhận địa điểm ứng phó bằng thôn đã xác minh hoặc tọa độ trên bản đồ trước khi lập phương án.",
      );
    }
    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id: warehouseId },
      select: { organizationId: true, communeId: true },
    });
    if (!warehouse) throw new NotFoundException("Không tìm thấy kho");
    const normalized = normalizeHamletName(location);
    const candidates = await (this.prisma as unknown as MissionHamletPrisma).hamlet.findMany({
      where: {
        organizationId: warehouse.organizationId,
        communeId: warehouse.communeId,
        aliases: { has: normalized },
      },
    });
    if (candidates.length === 0) {
      throw new BadRequestException(
        `Chưa nhận diện được địa điểm “${location}”. ADMIN cần chọn hoặc cấu hình thôn trước.`,
      );
    }
    if (candidates.length > 1) {
      throw new BadRequestException(
        `Địa điểm “${location}” đang mơ hồ. ADMIN cần xác nhận đúng thôn.`,
      );
    }
    const hamlet = candidates[0];
    if (!hamlet.verified || hamlet.lat == null || hamlet.lng == null) {
      throw new BadRequestException(
        `Thôn ${hamlet.name} chưa có điểm ứng phó đã xác minh. ADMIN cần hoàn tất cấu hình bản đồ.`,
      );
    }
    return {
      hamletId: hamlet.id,
      name: hamlet.name,
      point: { lat: hamlet.lat, lng: hamlet.lng },
    };
  }


  /**
   * Vật tư ADMIN có thể THÊM vào bản tham mưu của một nhiệm vụ.
   *
   * Luật đúng một câu: chỉ hiện thứ mà cụm kho của xã còn ÍT NHẤT MỘT đơn vị lấy
   * ra được ngay. Thêm một món cả xã không có là ghi vào phương án một dòng chắc
   * chắn thiếu 100% — nó không giúp ai chuẩn bị gì, chỉ kéo tụt số đáp ứng và đẩy
   * nhiệm vụ sang "chưa thể điều phối".
   *
   * "Còn lấy ra được" dùng lại đúng `loadClusterBatches` mà lượt lập phương án
   * dùng: cùng bộ lọc lô (hạn dùng, tình trạng, kệ khoá, kho có blocker) và cùng
   * phép trừ phần đã hứa cho nhiệm vụ khác. Đếm thẳng `ItemBatch.quantity` sẽ ra
   * một con số to hơn thực tế, và người dùng thêm vào rồi mới biết là không có.
   */
  async listRequirementOptions(
    missionId: string,
    actorUserId?: string,
    scopeWarehouseId?: string | null,
  ) {
    const mission = await this.getMission(missionId, actorUserId, scopeWarehouseId);
    if (!mission) throw new NotFoundException("Không tìm thấy nhiệm vụ");
    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id: mission.warehouseId },
      select: { organizationId: true, communeId: true },
    });
    if (!warehouse) throw new NotFoundException("Không tìm thấy kho");

    // Danh mục vật tư của chính đơn vị này. Lọc theo tồn kho thật ở bước sau —
    // ở đây chỉ cần tên và đơn vị để hiện cho người chọn.
    const items = await this.prisma.item.findMany({
      where: { batches: { some: { shelf: { zone: { warehouse: { organizationId: warehouse.organizationId, communeId: warehouse.communeId } } } } } },
      // Đơn vị đếm nằm ở NHÓM vật tư, không nằm trên chính vật tư: cả nhóm
      // "nước đóng chai" đếm theo chai, không có chuyện hai mã trong cùng nhóm
      // đếm khác nhau.
      select: { sku: true, name: true, category: { select: { unit: true } } },
      orderBy: { name: "asc" },
    });
    if (items.length === 0) return [];

    const pool = await this.loadClusterBatches(
      warehouse.organizationId,
      warehouse.communeId,
      items.map((item) => item.sku),
      mission.incidentLat != null && mission.incidentLng != null
        ? { lat: mission.incidentLat, lng: mission.incidentLng }
        : undefined,
      missionId,
    );
    const availableBySku = new Map<string, number>();
    for (const batch of pool.available) {
      availableBySku.set(batch.sku, (availableBySku.get(batch.sku) ?? 0) + batch.quantity);
    }
    const alreadyInPlan = new Set(mission.requirements.map((requirement) => requirement.sku));

    return items
      .map((item) => ({
        sku: item.sku,
        itemName: item.name,
        unit: item.category.unit,
        availableQuantity: availableBySku.get(item.sku) ?? 0,
        alreadyInPlan: alreadyInPlan.has(item.sku),
      }))
      .filter((option) => option.availableQuantity >= 1);
  }

  /**
   * ADMIN thêm / sửa / xoá một dòng vật tư trong bản tham mưu, rồi hệ thống
   * TÍNH LẠI khả năng đáp ứng theo đúng con số vừa sửa.
   *
   * Tính lại toàn bộ chứ không vá một dòng: phân bổ là bài toán tranh giành cùng
   * một kho hàng giữa các loại vật tư, nên sửa số của một loại có thể đổi kho
   * nào cấp cho loại khác. Vá một dòng thì các dòng còn lại giữ nguyên phân bổ cũ
   * và tổng số đáp ứng không còn khớp với bất kỳ phép cộng nào.
   *
   * CHỈ khi nhiệm vụ còn NHÁP. Đã duyệt và phát hành thì các kho đang cầm phiếu
   * xuất theo đúng con số cũ; đổi nhu cầu lúc đó là đổi lệnh dưới tay người đang
   * bốc hàng.
   */
  async changeRequirement(
    missionId: string,
    change:
      | { op: "add"; sku: string; quantity: number }
      | { op: "update"; sku: string; quantity: number }
      | { op: "remove"; sku: string },
    actorUserId?: string,
    scopeWarehouseId?: string | null,
  ) {
    const mission = await this.getMission(missionId, actorUserId, scopeWarehouseId);
    if (!mission) throw new NotFoundException("Không tìm thấy nhiệm vụ");
    if (mission.status !== MissionStatus.DRAFT) {
      throw new BadRequestException(
        "Chỉ sửa được vật tư khi nhiệm vụ còn là bản nháp. Nhiệm vụ đã phát hành thì các kho đang xuất theo đúng con số cũ.",
      );
    }
    const sku = change.sku.trim();
    if (!sku) throw new BadRequestException("Thiếu mã vật tư");

    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id: mission.warehouseId },
      select: { organizationId: true, communeId: true },
    });
    if (!warehouse) throw new NotFoundException("Không tìm thấy kho");

    const existing = mission.requirements.find((requirement) => requirement.sku === sku);
    const desired: Requirement[] = mission.requirements.map((requirement) => ({
      sku: requirement.sku,
      itemName: requirement.itemName,
      unit: requirement.unit,
      required: requirement.required,
    }));

    if (change.op === "remove") {
      if (!existing) throw new NotFoundException("Vật tư này không có trong bản tham mưu");
      const index = desired.findIndex((requirement) => requirement.sku === sku);
      desired.splice(index, 1);
    } else {
      this.assertRequirementQuantity(change.quantity);
      if (change.op === "update") {
        if (!existing) throw new NotFoundException("Vật tư này không có trong bản tham mưu");
        const index = desired.findIndex((requirement) => requirement.sku === sku);
        desired[index] = { ...desired[index], required: change.quantity };
      } else {
        if (existing) {
          throw new BadRequestException(
            `${existing.itemName} đã có trong bản tham mưu — sửa số lượng ở dòng đó thay vì thêm mới.`,
          );
        }
        // Chốt "có thật trong xã" NGAY TẠI ĐÂY, không tin màn hình đã lọc sẵn:
        // danh sách chọn tải về từ vài phút trước, và trong vài phút đó một
        // nhiệm vụ khác hoàn toàn có thể đã lấy hết món này.
        const options = await this.listRequirementOptions(missionId, actorUserId, scopeWarehouseId);
        const option = options.find((candidate) => candidate.sku === sku);
        if (!option) {
          throw new BadRequestException(
            "Không kho nào trong xã còn vật tư này, nên không thêm vào bản tham mưu được.",
          );
        }
        desired.push({
          sku: option.sku,
          itemName: option.itemName,
          unit: option.unit,
          required: change.quantity,
        });
      }
    }

    const pool = await this.loadClusterBatches(
      warehouse.organizationId,
      warehouse.communeId,
      desired.map((requirement) => requirement.sku),
      mission.incidentLat != null && mission.incidentLng != null
        ? { lat: mission.incidentLat, lng: mission.incidentLng }
        : undefined,
      missionId,
    );
    const allocations = desired.map((requirement) => allocateGreedy(requirement, pool.available));
    const readinessAssessment = assessMissionReadiness(allocations, pool.unavailableReasonsBySku);
    const neighbors = await this.prisma.neighborWarehouse.findMany({
      where: { warehouseId: mission.warehouseId },
    });

    return this.prisma.$transaction(async (tx) => {
      // Giành lại trạng thái NHÁP trước khi ghi: giữa lúc tính lại, một người
      // khác hoàn toàn có thể vừa bấm duyệt. Không có chốt này thì con số nhu cầu
      // đổi ngay dưới tay các kho vừa nhận phiếu.
      const claimed = await tx.mission.updateMany({
        where: { id: missionId, status: MissionStatus.DRAFT },
        data: {
          fulfillment: readinessAssessment.fulfillment,
          readinessAssessment: {
            ...readinessAssessment,
          } as unknown as Prisma.InputJsonValue,
          // Kế hoạch cứu hộ được viết TỪ bộ số vừa bị sửa, nên nó không còn đúng.
          // Giữ lại là bày ra một bản kể chuyện về những con số không còn tồn tại;
          // xoá đi thì nút "Lập kế hoạch cứu hộ" hiện lại và bản mới lập trên số mới.
          actionPlan: Prisma.DbNull,
          explanation: null,
        },
      });
      if (claimed.count === 0) {
        throw new BadRequestException(
          "Nhiệm vụ vừa được duyệt ở nơi khác nên không sửa vật tư được nữa. Tải lại trang để xem trạng thái mới.",
        );
      }
      await tx.missionRequirement.deleteMany({ where: { missionId } });
      await tx.mission.update({
        where: { id: missionId },
        data: { requirements: { create: this.buildRequirementCreates(allocations, neighbors) } },
      });
      return tx.mission.findUniqueOrThrow({
        where: { id: missionId },
        include: { requirements: true },
      });
    });
  }

  /**
   * Phân bổ lại theo TỒN KHO HIỆN TẠI, giữ nguyên nhu cầu.
   *
   * Dành cho lúc hàng mượn từ xã khác vừa về kho. Bản tham mưu chốt phân bổ ở
   * thời điểm lập, nên sau khi xã lân cận đồng ý và hàng đã nhập kho thì con số
   * "đáp ứng 0/150" vẫn nằm nguyên trên màn hình — người trực đi mượn xong, hàng
   * đã nằm trong kho, mà hệ thống vẫn báo thiếu.
   *
   * Khác `changeRequirement` ở chỗ KHÔNG đụng vào nhu cầu: cùng bộ `required`,
   * chỉ chạy lại phép chia hàng trên kho mới. Nhờ vậy nó không phải là một lần
   * sửa lệnh, và gọi lại bao nhiêu lần cũng ra cùng kết quả nếu kho không đổi.
   *
   * Kế hoạch cứu hộ chỉ bị xoá KHI phân bổ thật sự đổi. Bấm tính lại mà kho y
   * nguyên thì không có lý do gì bắt lập lại kế hoạch — đó là cách nhanh nhất
   * dạy người dùng đừng bấm nút này.
   */
  async recalculateSupply(
    missionId: string,
    actorUserId?: string,
    scopeWarehouseId?: string | null,
  ) {
    const mission = await this.getMission(missionId, actorUserId, scopeWarehouseId);
    if (!mission) throw new NotFoundException("Không tìm thấy nhiệm vụ");
    if (mission.status !== MissionStatus.DRAFT) {
      throw new BadRequestException(
        "Chỉ tính lại được khi nhiệm vụ còn là bản nháp. Nhiệm vụ đã phát hành thì các kho đang xuất theo đúng con số cũ.",
      );
    }
    if (mission.requirements.length === 0) {
      throw new BadRequestException("Bản tham mưu chưa có vật tư nào để tính lại.");
    }

    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id: mission.warehouseId },
      select: { organizationId: true, communeId: true },
    });
    if (!warehouse) throw new NotFoundException("Không tìm thấy kho");

    const desired: Requirement[] = mission.requirements.map((requirement) => ({
      sku: requirement.sku,
      itemName: requirement.itemName,
      unit: requirement.unit,
      required: requirement.required,
    }));

    const pool = await this.loadClusterBatches(
      warehouse.organizationId,
      warehouse.communeId,
      desired.map((requirement) => requirement.sku),
      mission.incidentLat != null && mission.incidentLng != null
        ? { lat: mission.incidentLat, lng: mission.incidentLng }
        : undefined,
      missionId,
    );
    const allocations = desired.map((requirement) => allocateGreedy(requirement, pool.available));
    const readinessAssessment = assessMissionReadiness(allocations, pool.unavailableReasonsBySku);
    const neighbors = await this.prisma.neighborWarehouse.findMany({
      where: { warehouseId: mission.warehouseId },
    });

    // So theo phần ĐÃ LẤY ĐƯỢC của từng loại: đó là thứ duy nhất mà việc mượn về
    // làm đổi, và cũng là thứ quyết định kế hoạch cứu hộ có còn đúng hay không.
    const allocatedBefore = new Map(
      mission.requirements.map((requirement) => [requirement.sku, requirement.allocated]),
    );
    const changed = allocations.some(
      (allocation) => allocatedBefore.get(allocation.sku) !== allocation.allocated,
    );

    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.mission.updateMany({
        where: { id: missionId, status: MissionStatus.DRAFT },
        data: {
          fulfillment: readinessAssessment.fulfillment,
          readinessAssessment: {
            ...readinessAssessment,
          } as unknown as Prisma.InputJsonValue,
          ...(changed ? { actionPlan: Prisma.DbNull, explanation: null } : {}),
        },
      });
      if (claimed.count === 0) {
        throw new BadRequestException(
          "Nhiệm vụ vừa được duyệt ở nơi khác nên không tính lại được. Tải lại trang để xem trạng thái mới.",
        );
      }
      await tx.missionRequirement.deleteMany({ where: { missionId } });
      await tx.mission.update({
        where: { id: missionId },
        data: { requirements: { create: this.buildRequirementCreates(allocations, neighbors) } },
      });
      return tx.mission.findUniqueOrThrow({
        where: { id: missionId },
        include: { requirements: true },
      });
    });
  }

  /** Số lượng nhu cầu: nguyên dương, và có trần để một lần gõ nhầm không thành 900 triệu. */
  private assertRequirementQuantity(quantity: number): void {
    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new BadRequestException("Số lượng phải là số nguyên dương");
    }
    if (quantity > MAX_REQUIREMENT_QUANTITY) {
      throw new BadRequestException(
        `Số lượng vượt trần cho phép (${MAX_REQUIREMENT_QUANTITY.toLocaleString("vi")}).`,
      );
    }
  }

  private async assertWarehouseAccess(
    warehouseId: string,
    actorUserId?: string,
    scopeWarehouseId?: string | null,
  ) {
    assertWarehouseInScope(scopeWarehouseId, warehouseId);
    if (!actorUserId) return;
    const [actor, warehouse] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: actorUserId }, select: { organizationId: true } }),
      this.prisma.warehouse.findUnique({
        where: { id: warehouseId },
        select: { organizationId: true },
      }),
    ]);
    if (!actor || !warehouse || actor.organizationId !== warehouse.organizationId) {
      throw new NotFoundException("Khong tim thay kho");
    }
  }

  /**
   * ADMIN duyệt và phát hành phương án trực tiếp tới các kho tham gia.
   * Lực lượng hiện trường chỉ nhận bản tin để theo dõi, không xác nhận hay
   * thay đổi trạng thái nhiệm vụ.
   */
  async approve(id: string, userId: string, scopeWarehouseId?: string | null) {
    await this.getMission(id, userId, scopeWarehouseId);
    const mission = await this.prisma.mission.findUnique({
      where: { id },
      include: {
        requirements: true,
        _count: { select: { requirements: true } },
        warehouse: { select: { organizationId: true } },
      },
    });
    if (!mission) throw new NotFoundException("Không tìm thấy nhiệm vụ");
    assertWarehouseInScope(scopeWarehouseId, mission.warehouseId);
    if (mission.status !== MissionStatus.DRAFT) {
      throw new BadRequestException("Chỉ duyệt được nhiệm vụ ở trạng thái nháp");
    }
    this.assertMissionHasIncidentPoint(mission);

    /**
     * Đánh giá cũ nói "không điều phối được" thì TÍNH LẠI trước khi chặn.
     *
     * `readinessAssessment` là ảnh chụp lúc lập phương án. Chặn thẳng theo nó thì
     * nhiệm vụ kẹt vĩnh viễn ở kết luận của quá khứ: kho vừa nhập hàng về, hoặc
     * nhiệm vụ đang giữ chỗ vừa bị huỷ, nhưng bấm phát hành vẫn nhận đúng câu từ
     * chối cũ và không có đường nào bắt hệ thống nhìn lại.
     *
     * Chỉ tính lại ở nhánh này: đánh giá đang nói được thì không phải trả giá
     * thêm một lượt tính cho mọi lượt phát hành.
     */
    const fresh = this.isNotDispatchable(mission.readinessAssessment)
      ? await this.refreshMissionForApproval(id, userId, scopeWarehouseId)
      : mission;

    this.assertMissionDispatchable(fresh.readinessAssessment, fresh.requirements.length);
    const warehouseIds = missionParticipantWarehouseIds(fresh.requirements, fresh.warehouseId);
    const warehouseRequests = buildWarehouseRequestCreates(id, fresh.requirements);

    /**
     * Đối chiếu phương án với TỒN THẬT ngay trước khi phát hành.
     *
     * `readinessAssessment` là ảnh chụp lúc lập phương án, có thể đã cũ hàng giờ.
     * Một xã có nhiều quản trị viên cùng duyệt, nên khoảng giữa "lập xong" và
     * "bấm phát hành" là chỗ người khác kịp nhận hết hàng của cùng một kho — và
     * trước đây cả hai lượt duyệt đều lọt, tới lúc kho xuất mới vỡ.
     *
     * Chặn ở đây thì lỗi nổ đúng chỗ người vừa gây ra nó, kèm câu nói rõ kho nào
     * hết bao nhiêu, thay vì nổ ở kho vài giờ sau và trưởng thôn phải đi hỏi.
     */
    const shortfalls = await this.detectCommitmentShortfalls(id, warehouseRequests);
    if (shortfalls.length > 0) {
      // Tính lại NGAY để phương án tự chuyển sang kho khác còn hàng — người dùng
      // quay lại thấy phần phân bổ mới, không phải tự đi tìm kho thay thế.
      await this.replanAfterShortfall(id, userId, scopeWarehouseId);
      throw new ConflictException(shortfallMessage(shortfalls));
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const approved = await tx.mission.updateMany({
        where: { id, status: MissionStatus.DRAFT },
        data: {
          status: MissionStatus.PENDING_WAREHOUSE,
          approvedByUserId: userId,
          approvedAt: new Date(),
        },
      });
      if (approved.count === 0) {
        throw new BadRequestException(
          "Nhiệm vụ vừa được cập nhật, vui lòng tải lại trước khi phát hành",
        );
      }
      await tx.missionWarehousePreparation.createMany({
        data: warehouseIds.map((warehouseId) => ({ missionId: id, warehouseId })),
        skipDuplicates: true,
      });
      if (warehouseRequests.length > 0) {
        await tx.missionWarehouseRequest.createMany({
          data: warehouseRequests.map((request) => ({
            ...request,
            allocations: request.allocations as unknown as Prisma.InputJsonValue,
          })),
          skipDuplicates: true,
        });
      }
      // Chép tình huống vào thông báo: thẻ trên web dựa vào đây để chọn biểu
      // tượng đúng loại thiên tai và in đậm số người, tên thôn. Hai lệnh tạo này
      // nằm trong transaction nên không đi qua NotificationService — phần tự chép
      // ở đó không chạm tới, phải truyền tay.
      const context = {
        // Số hiệu là DANH TÍNH của việc: thẻ thông báo trên web và trên máy trưởng
        // thôn đều mở đầu bằng "Nhiệm vụ số N", vì một đợt lũ sinh ra cả chục
        // nhiệm vụ giống hệt nhau ở loại thiên tai và số người.
        missionNo: mission.missionNo,
        incidentType: mission.incidentType,
        affectedPeople: mission.affectedPeople,
        locationName: mission.hamletName ?? mission.location ?? null,
      };
      /*
        MỘT thông báo cho MỖI kho tham gia, mỗi cái ghi đích danh kho nhận.

        Trước đây đây là một thông báo duy nhất không ghi kho, và thông báo không
        ghi kho thì mọi kho trong xã đều nhận. Lệnh "chuẩn bị vật tư" của nhiệm vụ
        chỉ giao cho kho thôn Long Châu nổ chuông ở cả kho Đồng Xuân lẫn kho Tân
        Bình: hai kho không có phần việc nào vẫn tưởng tới lượt mình, mở ra không
        thấy dòng vật tư nào của mình, và lần sau họ bỏ qua tiếng chuông — kể cả
        tiếng chuông thật.

        `warehouseIds` là đúng bộ kho vừa được ghi phiếu chuẩn bị ngay phía trên,
        nên không có kho nào nhận lệnh mà không có việc, và không kho nào có việc
        mà không nhận được lệnh.
      */
      const warehouseNotifications: Awaited<ReturnType<typeof tx.notification.create>>[] = [];
      for (const warehouseId of warehouseIds) {
        warehouseNotifications.push(
          await tx.notification.create({
            data: {
              recipientRole: UserRole.WAREHOUSE,
              kind: NotificationKind.MISSION_ASSIGNED,
              title: "Phương án vật tư mới cần chuẩn bị",
              body: `${incidentTypeLabel(mission.incidentType)} — ${mission.affectedPeople} người. Chuẩn bị phần vật tư được phân bổ cho kho.`,
              missionId: id,
              warehouseId,
              organizationId: mission.warehouse.organizationId,
              ...context,
            },
          }),
        );
      }
      const fieldForceNotification = await tx.notification.create({
        data: {
          recipientRole: UserRole.RESCUE,
          kind: NotificationKind.MISSION_ASSIGNED,
          title: "Phương án ứng phó mới",
          body: `${incidentTypeLabel(mission.incidentType)} — ${mission.affectedPeople} người. Xem tuyến và các điểm lấy vật tư trong phương án.`,
          missionId: id,
          organizationId: mission.warehouse.organizationId,
          ...context,
        },
      });
      const updated = await tx.mission.findUniqueOrThrow({
        where: { id },
        include: { requirements: true, warehousePreparations: true },
      });
      return { updated, notifications: [...warehouseNotifications, fieldForceNotification] };
    });
    for (const notification of result.notifications) {
      this.notifications.pushPersisted(notification);
    }
    return result.updated;
  }

  /**
   * Gửi một thông báo kho tới ĐÚNG những kho có phần việc trong nhiệm vụ.
   *
   * Không ghi kho thì thông báo là tin chung của cả xã và mọi kho đều nhận — đúng
   * cho "nhiệm vụ đã huỷ" nếu mọi kho đều đang chuẩn bị, nhưng sai hoàn toàn cho
   * một nhiệm vụ chỉ huy động một kho. Mà phần lớn nhiệm vụ chỉ huy động một kho.
   *
   * Danh sách kho lấy từ phiếu chuẩn bị — bản ghi được tạo đúng lúc phát hành,
   * nên nó là câu trả lời chính thức cho "kho nào có việc ở nhiệm vụ này".
   *
   * Nhiệm vụ cũ không có phiếu chuẩn bị nào thì lùi về kho đã nhận báo cáo: đó là
   * kho chịu trách nhiệm mặc định, và vẫn hẹp hơn hẳn việc gửi cho cả xã.
   */
  private async notifyMissionWarehouses(
    missionId: string,
    fallbackWarehouseId: string,
    notification: Omit<CreateNotification, "warehouseId" | "missionId">,
  ) {
    const preparations = await this.prisma.missionWarehousePreparation.findMany({
      where: { missionId },
      select: { warehouseId: true },
    });
    const warehouseIds =
      preparations.length > 0
        ? preparations.map((preparation) => preparation.warehouseId)
        : [fallbackWarehouseId];
    for (const warehouseId of warehouseIds) {
      await this.notifications.create({ ...notification, missionId, warehouseId });
    }
  }

  /** Lưu giải thích AI (proxy từ ai-service) vào nhiệm vụ. */
  async setExplanation(
    id: string,
    explanation: string,
    actorUserId?: string,
    scopeWarehouseId?: string | null,
  ) {
    await this.getMission(id, actorUserId, scopeWarehouseId);
    return this.prisma.mission.update({ where: { id }, data: { explanation } });
  }

  // ===== Workflow liên role (BE-L) =====

  /** ADMIN gửi phương án → chờ cứu hộ. DRAFT → PENDING_RESCUE, notify RESCUE. */
  async dispatch(id: string, actorUserId?: string, scopeWarehouseId?: string | null) {
    const mission = await this.prisma.mission.findUnique({
      where: { id },
      include: {
        _count: { select: { requirements: true } },
        warehouse: { select: { organizationId: true } },
      },
    });
    if (!mission) throw new NotFoundException("Không tìm thấy nhiệm vụ");
    await this.getMission(id, actorUserId, scopeWarehouseId);
    this.assertMissionHasIncidentPoint(mission);
    this.guardTransition(mission.status, MissionStatus.PENDING_RESCUE);
    this.assertMissionDispatchable(mission.readinessAssessment, mission._count.requirements);
    const result = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.mission.updateMany({
        where: { id, status: mission.status },
        data: { status: MissionStatus.PENDING_RESCUE },
      });
      if (claimed.count === 0) {
        throw new BadRequestException("Nhiệm vụ vừa được cập nhật, vui lòng tải lại");
      }
      const notification = await tx.notification.create({
        data: {
          recipientRole: UserRole.RESCUE,
          kind: NotificationKind.MISSION_ASSIGNED,
          title: "Nhiệm vụ cứu hộ mới",
          body: `${mission.incidentType} — ${mission.affectedPeople} người. Xác nhận để lấy vật tư.`,
          missionId: id,
          missionNo: mission.missionNo,
          organizationId: mission.warehouse.organizationId,
        },
      });
      const updated = await tx.mission.findUniqueOrThrow({ where: { id } });
      return { updated, notification };
    });
    this.notifications.pushPersisted(result.notification);
    return result.updated;
  }

  /** RESCUE xác nhận lấy → chờ kho chuẩn bị. → PENDING_WAREHOUSE, notify WAREHOUSE. */
  async confirmByRescue(id: string, scopeWarehouseId?: string | null) {
    const mission = await this.prisma.mission.findUnique({
      where: { id },
      include: { requirements: true },
    });
    if (!mission) throw new NotFoundException("Không tìm thấy nhiệm vụ");
    assertWarehouseInScope(scopeWarehouseId, mission.warehouseId);
    this.guardTransition(mission.status, MissionStatus.RESCUE_CONFIRMED);
    const warehouseIds = missionParticipantWarehouseIds(mission.requirements, mission.warehouseId);
    const updated = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.mission.updateMany({
        where: { id, status: mission.status },
        data: { status: MissionStatus.PENDING_WAREHOUSE },
      });
      if (claimed.count === 0) {
        const current = await tx.mission.findUnique({ where: { id } });
        if (!current) throw new NotFoundException("Không tìm thấy nhiệm vụ");
        this.guardTransition(current.status, MissionStatus.RESCUE_CONFIRMED);
        throw new BadRequestException("Nhiệm vụ vừa được cập nhật, vui lòng tải lại");
      }
      await tx.missionWarehousePreparation.createMany({
        data: warehouseIds.map((warehouseId) => ({ missionId: id, warehouseId })),
        skipDuplicates: true,
      });
      return tx.mission.findUniqueOrThrow({
        where: { id },
        include: { requirements: true, warehousePreparations: true },
      });
    });
    await this.notifyMissionWarehouses(id, mission.warehouseId, {
      recipientRole: UserRole.WAREHOUSE,
      kind: NotificationKind.RESCUE_CONFIRMED,
      title: "Cứu hộ đã xác nhận — chuẩn bị vật tư",
      body: `${mission.incidentType} — ${mission.affectedPeople} người. Chuẩn bị và xuất kho theo phương án.`,
    });
    return updated;
  }

  /**
   * RESCUE từ chối / rút nhiệm vụ (kèm lý do) → REJECTED, notify ADMIN.
   * Cho phép ở PENDING_RESCUE (chưa nhận) lẫn RESCUE_CONFIRMED/PENDING_WAREHOUSE
   * (đã nhận nhưng gặp sự cố hiện trường). Nếu rút SAU khi đã xác nhận thì kho có
   * thể đang chờ/chuẩn bị → báo thêm WAREHOUSE dừng lại, tránh xuất kho thừa.
   */
  async rejectByRescue(id: string, reason: string, scopeWarehouseId?: string | null) {
    const mission = await this.requireMission(id, scopeWarehouseId);
    this.guardTransition(mission.status, MissionStatus.REJECTED);
    const afterConfirm =
      mission.status === MissionStatus.RESCUE_CONFIRMED ||
      mission.status === MissionStatus.PENDING_WAREHOUSE;
    const updated =
      mission.status === MissionStatus.PENDING_WAREHOUSE
        ? await this.updatePendingWarehouseMissionBeforeExport(
            id,
            { status: MissionStatus.REJECTED, rejectionReason: reason },
            MissionStatus.REJECTED,
          )
        : await this.updateMissionIfCurrent(
            id,
            mission.status,
            { status: MissionStatus.REJECTED, rejectionReason: reason },
            MissionStatus.REJECTED,
          );
    await this.notifications.create({
      recipientRole: UserRole.ADMIN,
      kind: NotificationKind.MISSION_REJECTED,
      title: afterConfirm
        ? `${FIELD_FORCE_ROLE_LABEL} báo không tiếp tục được`
        : `${FIELD_FORCE_ROLE_LABEL} từ chối nhiệm vụ`,
      body: `${mission.incidentType} — ${mission.affectedPeople} người. Lý do: ${reason}`,
      missionId: id,
    });
    // Đội rút khi kho đang chờ/chuẩn bị → báo kho dừng, chưa xuất thì khỏi xuất.
    if (afterConfirm) {
      await this.notifyMissionWarehouses(id, mission.warehouseId, {
        recipientRole: UserRole.WAREHOUSE,
        kind: NotificationKind.MISSION_REJECTED,
        title: `Tạm dừng chuẩn bị — ${FIELD_FORCE_ROLE_LABEL} đã rút`,
        body: `${mission.incidentType} — ${mission.affectedPeople} người. ${FIELD_FORCE_ROLE_LABEL} không tiếp tục được, chờ điều phối xử lý.`,
      });
    }
    return updated;
  }

  /**
   * ADMIN tiếp nhận đơn từ chối → tạm hoãn (REJECTED → DEFERRED), báo RESCUE.
   * Mission vào danh sách tạm hoãn để admin sửa/ghi chú rồi gửi lại sau.
   */
  async deferByAdmin(id: string, note?: string, scopeWarehouseId?: string | null) {
    const mission = await this.requireMission(id, scopeWarehouseId);
    this.guardTransition(mission.status, MissionStatus.DEFERRED);
    const updated = await this.updateMissionIfCurrent(
      id,
      mission.status,
      { status: MissionStatus.DEFERRED, adminNote: note ?? null },
      MissionStatus.DEFERRED,
    );
    await this.notifications.create({
      recipientRole: UserRole.RESCUE,
      kind: NotificationKind.MISSION_DEFERRED,
      title: "Đơn từ chối đã được tiếp nhận",
      body: `${mission.incidentType} — ${mission.affectedPeople} người. Đang được xem xét, sẽ cập nhật lại.${note ? ` Ghi chú: ${note}` : ""}`,
      missionId: id,
    });
    return updated;
  }

  /**
   * ADMIN gửi lại nhiệm vụ tạm hoãn cho Lực lượng hiện trường (DEFERRED → PENDING_RESCUE),
   * kèm ghi chú phản hồi. GIỮ NGUYÊN phương án phân bổ hiện tại — nếu cần đổi
   * nhân lực/vật tư (đội từ chối vì thiếu) thì admin lập phương án MỚI, không
   * dùng resend. Lực lượng hiện trường xác nhận / từ chối lại như bình thường.
   */
  async resendByAdmin(id: string, note?: string, scopeWarehouseId?: string | null) {
    const mission = await this.requireMission(id, scopeWarehouseId);
    this.guardTransition(mission.status, MissionStatus.PENDING_RESCUE);
    const updated = await this.updateMissionIfCurrent(
      id,
      mission.status,
      { status: MissionStatus.PENDING_RESCUE, adminNote: note ?? mission.adminNote },
      MissionStatus.PENDING_RESCUE,
    );
    await this.notifications.create({
      recipientRole: UserRole.RESCUE,
      kind: NotificationKind.MISSION_ASSIGNED,
      title: "Nhiệm vụ đã cập nhật — mời xác nhận lại",
      body: `${incidentTypeLabel(mission.incidentType)} — ${mission.affectedPeople} người.${note ? ` Phản hồi: ${note}` : ""}`,
      missionId: id,
    });
    return updated;
  }

  /**
   * ADMIN huỷ nhiệm vụ, kèm lý do gửi Lực lượng hiện trường. Huỷ được ở mọi bước TRƯỚC khi
   * kho xuất vật tư (DRAFT/PENDING_RESCUE/RESCUE_CONFIRMED/PENDING_WAREHOUSE) và
   * từ REJECTED/DEFERRED. Kết thúc luồng — không gửi lại được nữa. Nếu đang chờ
   * kho chuẩn bị thì báo thêm WAREHOUSE dừng; Lực lượng hiện trường luôn được báo.
   */
  async cancelByAdmin(
    id: string,
    note?: string,
    scopeWarehouseId?: string | null,
    actorUserId?: string,
  ) {
    const mission = await this.requireMission(id, scopeWarehouseId);
    await this.assertActorInMissionOrganization(actorUserId, mission.warehouseId);
    this.guardTransition(mission.status, MissionStatus.CANCELLED);
    const warehouseWasWaiting =
      mission.status === MissionStatus.RESCUE_CONFIRMED ||
      mission.status === MissionStatus.PENDING_WAREHOUSE;
    const updated =
      mission.status === MissionStatus.PENDING_WAREHOUSE
        ? await this.updatePendingWarehouseMissionBeforeExport(
            id,
            { status: MissionStatus.CANCELLED, adminNote: note ?? null },
            MissionStatus.CANCELLED,
          )
        : await this.updateMissionIfCurrent(
            id,
            mission.status,
            { status: MissionStatus.CANCELLED, adminNote: note ?? null },
            MissionStatus.CANCELLED,
          );
    await this.notifications.create({
      recipientRole: UserRole.RESCUE,
      kind: NotificationKind.MISSION_CANCELLED,
      title: "Nhiệm vụ đã huỷ",
      body: `${mission.incidentType} — ${mission.affectedPeople} người. Nhiệm vụ đã huỷ.${note ? ` Lý do: ${note}` : ""}`,
      missionId: id,
    });
    if (warehouseWasWaiting) {
      await this.notifyMissionWarehouses(id, mission.warehouseId, {
        recipientRole: UserRole.WAREHOUSE,
        kind: NotificationKind.MISSION_CANCELLED,
        title: "Nhiệm vụ đã huỷ — dừng chuẩn bị",
        body: `${mission.incidentType} — ${mission.affectedPeople} người. Điều phối đã huỷ, không cần xuất kho.${note ? ` Lý do: ${note}` : ""}`,
      });
    }
    return updated;
  }

  /**
   * RESCUE xác nhận kết quả giao hiện trường (READY → COMPLETED). Ghi nhận
   * outcome + ghi chú, XỬ LÝ TỒN KHO theo kết quả, báo ADMIN và WAREHOUSE.
   * Bước DUY NHẤT đưa mission về COMPLETED.
   *
   * Hoàn kho:
   * - DELIVERED (giao đủ): không đụng kho — hàng đã giao hết theo phương án.
   * - FAILED (không giao được): tự nhập lại 100% phần đã xuất về đúng lô cũ.
   * - PARTIAL (giao một phần): KHÔNG tự đoán số — gắn cảnh báo kho đối soát nhập lại.
   *
   * Update mission + hoàn kho gói trong CÙNG một transaction: guard COMPLETED→*
   * chặn bấm 2 lần, nên không hoàn kho trùng (retry-safe).
   */
  async completeByRescue(
    id: string,
    outcome: DeliveryOutcome,
    userId: string,
    note?: string,
    scopeWarehouseId?: string | null,
    photos?: DeliveryPhotoInput[],
  ) {
    const mission = await this.prisma.mission.findUnique({
      where: { id },
      include: {
        requirements: true,
        // Phần ĐÃ THẬT SỰ RỜI KHO, không phải phần phương án định lấy: hai con số
        // này lệch nhau ngay khi điều phối cắt bớt một phiếu trước lúc kho xuất.
        warehouseRequests: {
          select: { status: true, preparedAllocations: true },
        },
      },
    });
    if (!mission) throw new NotFoundException("Không tìm thấy nhiệm vụ");
    assertWarehouseInScope(scopeWarehouseId, mission.warehouseId);
    await this.assertActorInMissionOrganization(userId, mission.warehouseId);
    this.guardTransition(mission.status, MissionStatus.COMPLETED);

    // Giải mã ảnh TRƯỚC khi mở transaction: ảnh hỏng thì phải hỏng ngay, chứ
    // không phải sau khi nhiệm vụ đã chuyển COMPLETED rồi mới ném lỗi.
    const decoded = decodeDeliveryPhotos(photos);
    if (!decoded.ok) throw new BadRequestException(decoded.message);
    // Nén và đẩy lên kho ảnh cũng làm ngoài transaction: cả hai đều chậm (giải
    // nén ảnh 12MP, rồi một lượt mạng cho mỗi tấm), mà transaction đang giữ khoá
    // trên chính nhiệm vụ và các lô vật tư của nó.
    const stored = await this.storeDeliveryPhotos(id, userId, decoded.photos);

    const restockItems =
      outcome === DeliveryOutcome.FAILED ? collectRestockBatches(mission) : [];

    const updated = await this.prisma
      .$transaction(async (tx) => {
        const claim = await tx.mission.updateMany({
          where: { id, status: MissionStatus.READY },
          data: {
            status: MissionStatus.COMPLETED,
            deliveryOutcome: outcome,
            deliveryNote: note ?? null,
            completedAt: new Date(),
          },
        });
        if (claim.count === 0) {
          const current = await tx.mission.findUnique({ where: { id } });
          if (!current) throw new NotFoundException("Không tìm thấy nhiệm vụ");
          this.guardTransition(current.status, MissionStatus.COMPLETED);
          throw new BadRequestException("Nhiệm vụ vừa được cập nhật, vui lòng tải lại");
        }
        if (stored.rows.length > 0) {
          // Nằm trong CÙNG transaction với bước đóng nhiệm vụ: ảnh bằng chứng mà
          // rớt lại trong khi nhiệm vụ đã COMPLETED thì người gửi không còn đường
          // nào gửi lại — màn hình báo kết quả đã đóng theo trạng thái.
          await tx.missionDeliveryPhoto.createMany({ data: stored.rows });
        }
        if (restockItems.length > 0) {
          await this.inventory.bulkImportInTx(
            tx,
            userId,
            restockItems,
            `Hoàn kho: nhiệm vụ ${id} giao thất bại`,
          );
        }
        return tx.mission.findUniqueOrThrow({ where: { id } });
      })
      // Ghi DB hỏng thì ảnh vừa tải lên thành vật thể mồ côi — không hàng nào trỏ
      // tới nữa. Kho ảnh không tự biết tấm nào bỏ đi, nên phải dọn ngay tại đây.
      .catch(async (error: unknown) => {
        await this.evidenceStorage.removeQuietly(stored.uploadedKeys);
        throw error;
      });
    // Recalc readiness sau commit (không nằm trong tx để không giữ lock lâu).
    if (restockItems.length > 0) {
      await this.inventory.recalcBatches(restockItems.map((item) => item.batchId));
    }

    const label = DELIVERY_OUTCOME_LABEL[outcome];
    // Ghi chú kho tuỳ kết quả: FAILED đã tự hoàn; PARTIAL cần người đối soát.
    const stockNote =
      outcome === DeliveryOutcome.FAILED
        ? " Vật tư đã được tự động hoàn về kho."
        : outcome === DeliveryOutcome.PARTIAL
          ? " Cần đối soát và nhập lại phần chưa giao khi nhận hàng về."
          : "";
    const photoNote = decoded.photos.length > 0 ? ` Kèm ${decoded.photos.length} ảnh bằng chứng.` : "";
    for (const role of [UserRole.ADMIN, UserRole.WAREHOUSE]) {
      await this.notifications.create({
        recipientRole: role,
        kind: NotificationKind.MISSION_COMPLETED,
        // Nói ĐÚNG VIỆC VỪA XẢY RA: hiện trường đã báo cáo hoàn thành. Câu cũ
        // ("đã giao — Đã giao đủ") đọc như một dòng trạng thái kho và không cho
        // biết là có một BÁO CÁO đang chờ người điều phối mở ra đọc.
        title: `${FIELD_FORCE_ROLE_LABEL} đã báo cáo hoàn thành nhiệm vụ`,
        // Không lặp lại loại thiên tai và số người: cả thẻ thông báo lẫn hộp nổi
        // đều đã hiện sẵn hai thứ đó từ dữ liệu có cấu trúc. Lặp lại bằng chữ chỉ
        // tổ in ra mã enum thô ("FLOOD") bên cạnh chính cái nhãn tiếng Việt của nó.
        body: `${missionLabel(mission.missionNo)} — kết quả: ${label}.${note ? ` Ghi chú: ${note}` : ""}${photoNote}${stockNote}${
          role === UserRole.WAREHOUSE
            ? " Kho đếm lại hàng về rồi bấm xác nhận đã hoàn trả để đóng nhiệm vụ."
            : ""
        }`,
        missionId: id,
      });
    }
    return updated;
  }

  /**
   * Những dòng vật tư kho phải ĐẾM LẠI khi đội cứu hộ xong việc.
   *
   * Chỉ hàng TÁI SỬ DỤNG, và chỉ những dòng đội đã thật sự ký nhận mang đi. Mì
   * tôm, nước đóng chai, lương khô đã phát cho dân thì không có gì để trả — bày
   * chúng ra trong danh sách "trả chưa đủ" là mời người trực khai một khoản thiếu
   * không tồn tại, và con số đó sẽ nằm lại trong báo cáo thất thoát.
   *
   * Phạm vi theo kho của người hỏi: mỗi kho đếm lại đúng phần mình đã giao ra.
   */
  async listReturnableSupplies(
    missionId: string,
    actorUserId: string,
    scopeWarehouseId?: string | null,
  ) {
    const mission = await this.getMission(missionId, actorUserId, scopeWarehouseId);
    const requests = await this.prisma.missionWarehouseRequest.findMany({
      where: {
        missionId,
        ...(scopeWarehouseId ? { warehouseId: scopeWarehouseId } : {}),
        pickedUpQuantity: { gt: 0 },
      },
      orderBy: [{ warehouseId: "asc" }, { itemName: "asc" }],
      select: {
        sku: true,
        itemName: true,
        unit: true,
        pickedUpQuantity: true,
        returnedQuantity: true,
        warehouse: { select: { id: true, name: true } },
      },
    });
    const reusableSkus = await this.reusableSkus(requests.map((request) => request.sku));

    return {
      missionStatus: mission.status,
      items: requests
        .filter((request) => reusableSkus.has(request.sku))
        .map((request) => {
          const handedOver = request.pickedUpQuantity ?? 0;
          const returned = request.returnedQuantity ?? 0;
          return {
            sku: request.sku,
            itemName: request.itemName,
            unit: request.unit,
            warehouseId: request.warehouse.id,
            warehouseName: request.warehouse.name,
            handedOverQuantity: handedOver,
            /** `null` = kho chưa đếm dòng này, khác hẳn "đã đếm và về 0". */
            returnedQuantity: request.returnedQuantity,
            outstandingQuantity: Math.max(0, handedOver - returned),
          };
        }),
    };
  }

  /**
   * Lọc ra mã hàng TÁI SỬ DỤNG trong một danh sách mã.
   *
   * Mã không có trong danh mục thì coi là tái sử dụng: thà hỏi thừa một dòng còn
   * hơn lặng lẽ bỏ sót một cái loa cầm tay không bao giờ được ai đòi về.
   */
  private async reusableSkus(skus: string[]): Promise<Set<string>> {
    const unique = [...new Set(skus)];
    if (unique.length === 0) return new Set();
    const items = await this.prisma.item.findMany({
      where: { sku: { in: unique } },
      select: { sku: true, consumable: true },
    });
    const consumable = new Set(items.filter((item) => item.consumable).map((item) => item.sku));
    return new Set(unique.filter((sku) => !consumable.has(sku)));
  }

  /**
   * KHO xác nhận đã nhận lại vật tư — bước cuối, đóng hẳn nhiệm vụ.
   *
   * Giao xong không phải là hết việc. Áo phao, đèn pin, bạt che là hàng tái sử
   * dụng: chúng phải quay về kho rồi mới tính là khép lại. Trước đây nhiệm vụ dừng
   * ở COMPLETED nên phần hàng đó không có mốc nào để đóng, và người trực không có
   * cách nào phân biệt "đã giao xong" với "đã thu hồi xong" — hai việc cách nhau
   * có khi vài ngày.
   *
   * CHỈ KHO bấm được, không phải điều phối: người đếm lại hàng khi nó về tới nơi
   * mới là người biết nó về đủ hay không. Điều phối ký hộ thì chữ ký đó rỗng.
   *
   * Hai đường vào, và chúng nói hai điều khác nhau:
   *
   *   - KHÔNG truyền `items`: "về đủ hết". Mọi dòng tái sử dụng của nhiệm vụ được
   *     ghi là đã về đủ và nhiệm vụ khép sổ — giữ nguyên hành vi cũ, gồm cả việc
   *     một kho ký thay được cho cả nhiệm vụ (hàng thừa thường dồn về một chỗ).
   *   - CÓ `items`: kho đếm từng dòng. Số đếm được ghi lại NGAY, kể cả khi còn
   *     thiếu — thiếu mà không ghi thì con số đó chỉ nằm trong đầu người trực, và
   *     tới chuyến sau không ai còn nhớ đội đang nợ bao nhiêu cái loa. Nhiệm vụ
   *     chỉ khép sổ khi không còn dòng nào thiếu.
   */
  async markReturnedByWarehouse(
    id: string,
    userId: string,
    scopeWarehouseId?: string | null,
    input: SupplyReturnInput = {},
  ) {
    const mission = await this.prisma.mission.findUnique({ where: { id } });
    if (!mission) throw new NotFoundException("Không tìm thấy nhiệm vụ");
    await this.assertActorInMissionOrganization(userId, mission.warehouseId);
    const actor = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (actor?.role !== UserRole.WAREHOUSE) {
      throw new ForbiddenException(
        "Chỉ tài khoản kho mới xác nhận được việc hoàn trả vật tư — kho là bên đếm lại hàng khi nó về.",
      );
    }
    /*
      KHÔNG dùng `assertWarehouseInScope(scope, mission.warehouseId)` ở đây.

      `mission.warehouseId` là kho đã TIẾP NHẬN báo cáo, thường là kho thôn nơi
      xảy ra sự việc — không phải kho đã xuất hàng. Chốt theo nó thì mọi kho khác
      tham gia phương án đều bị chặn, kể cả kho tổng vừa xuất phần lớn số hàng.

      Điều kiện đúng là kho của người bấm CÓ THAM GIA nhiệm vụ này: hoặc là kho
      nhận báo cáo, hoặc có phiếu vật tư trong phương án. Một nhiệm vụ huy động
      nhiều kho, và hàng thừa thường dồn về một chỗ chứ không chia lại đúng như
      lúc xuất — bắt từng kho ký riêng thì nhiệm vụ treo mãi ở kho không có gì để
      nhận về.
    */
    if (scopeWarehouseId && scopeWarehouseId !== mission.warehouseId) {
      const participates = await this.prisma.missionWarehouseRequest.count({
        where: { missionId: id, warehouseId: scopeWarehouseId },
      });
      if (participates === 0) {
        throw new ForbiddenException("Kho của bạn không tham gia nhiệm vụ này");
      }
    }
    this.guardTransition(mission.status, MissionStatus.RETURNED);
    await this.recordReturnedQuantities(id, scopeWarehouseId, input);

    /*
      Còn dòng nào chưa về đủ thì nhiệm vụ CHƯA khép sổ.

      Đếm trên toàn nhiệm vụ chứ không chỉ phần của kho vừa bấm: khép sổ là tuyên
      bố "không còn gì ở ngoài nữa", mà kho A không biết kho B đã nhận về chưa.
    */
    const outstanding = await this.outstandingReturns(id);
    if (outstanding.length > 0) {
      return {
        ...(await this.prisma.mission.findUniqueOrThrow({ where: { id } })),
        outstandingReturns: outstanding,
      };
    }

    const claim = await this.prisma.mission.updateMany({
      where: { id, status: MissionStatus.COMPLETED },
      data: {
        status: MissionStatus.RETURNED,
        returnedAt: new Date(),
        returnedByUserId: userId,
      },
    });
    if (claim.count === 0) {
      const current = await this.prisma.mission.findUnique({ where: { id } });
      if (!current) throw new NotFoundException("Không tìm thấy nhiệm vụ");
      this.guardTransition(current.status, MissionStatus.RETURNED);
      throw new BadRequestException("Nhiệm vụ vừa được cập nhật, vui lòng tải lại");
    }

    for (const role of [UserRole.ADMIN, UserRole.RESCUE]) {
      await this.notifications.create({
        recipientRole: role,
        kind: NotificationKind.MISSION_SUPPLIES_RETURNED,
        title: "Kho đã nhận lại vật tư — nhiệm vụ khép lại",
        body: `${missionLabel(mission.missionNo)}: kho xác nhận đã thu hồi và đếm lại vật tư. Không còn bước nào phải làm.`,
        missionId: id,
      });
    }
    return {
      ...(await this.prisma.mission.findUniqueOrThrow({ where: { id } })),
      outstandingReturns: [],
    };
  }

  /**
   * Ghi số đã nhận về cho từng dòng vật tư tái sử dụng.
   *
   * Không truyền `items` nghĩa là "về đủ hết": mọi dòng tái sử dụng của NHIỆM VỤ
   * (không chỉ của kho đang bấm) được ghi bằng đúng số đã giao ra.
   */
  private async recordReturnedQuantities(
    missionId: string,
    scopeWarehouseId: string | null | undefined,
    input: SupplyReturnInput,
  ) {
    const requests = await this.prisma.missionWarehouseRequest.findMany({
      where: { missionId, pickedUpQuantity: { gt: 0 } },
      select: {
        id: true,
        sku: true,
        itemName: true,
        warehouseId: true,
        pickedUpQuantity: true,
      },
    });
    const reusable = await this.reusableSkus(requests.map((request) => request.sku));
    const returnableRows = requests.filter((request) => reusable.has(request.sku));
    if (returnableRows.length === 0) return;
    const now = new Date();

    if (!input.items) {
      await this.prisma.$transaction(
        returnableRows.map((row) =>
          this.prisma.missionWarehouseRequest.update({
            where: { id: row.id },
            data: { returnedQuantity: row.pickedUpQuantity ?? 0, returnedAt: now },
          }),
        ),
      );
      return;
    }

    // Kho chỉ đếm được phần CHÍNH MÌNH đã giao ra; dòng của kho khác không phải
    // việc của họ, và nhận bừa ở đây là để một kho sửa sổ của kho bên cạnh.
    const editable = new Map(
      returnableRows
        .filter((row) => !scopeWarehouseId || row.warehouseId === scopeWarehouseId)
        .map((row) => [row.sku, row]),
    );
    const updates = input.items.map((item) => {
      const row = editable.get(item.sku);
      if (!row) {
        throw new BadRequestException(
          `Vật tư ${item.sku} không thuộc phần kho của bạn đã giao ra trong nhiệm vụ này.`,
        );
      }
      const handedOver = row.pickedUpQuantity ?? 0;
      if (!Number.isInteger(item.returnedQuantity) || item.returnedQuantity < 0) {
        throw new BadRequestException(`${row.itemName}: số đã trả phải là số nguyên không âm.`);
      }
      if (item.returnedQuantity > handedOver) {
        throw new BadRequestException(
          `${row.itemName}: nhận về ${item.returnedQuantity} trong khi chỉ giao ra ${handedOver}. Kiểm tra lại số đếm.`,
        );
      }
      return this.prisma.missionWarehouseRequest.update({
        where: { id: row.id },
        data: { returnedQuantity: item.returnedQuantity, returnedAt: now },
      });
    });
    if (updates.length > 0) await this.prisma.$transaction(updates);
  }

  /** Những dòng tái sử dụng của nhiệm vụ còn thiếu — rỗng nghĩa là khép sổ được. */
  private async outstandingReturns(missionId: string) {
    const requests = await this.prisma.missionWarehouseRequest.findMany({
      where: { missionId, pickedUpQuantity: { gt: 0 } },
      select: {
        sku: true,
        itemName: true,
        unit: true,
        pickedUpQuantity: true,
        returnedQuantity: true,
        warehouse: { select: { id: true, name: true } },
      },
    });
    const reusable = await this.reusableSkus(requests.map((request) => request.sku));
    return requests
      .filter((request) => reusable.has(request.sku))
      .map((request) => ({
        sku: request.sku,
        itemName: request.itemName,
        unit: request.unit,
        warehouseId: request.warehouse.id,
        warehouseName: request.warehouse.name,
        handedOverQuantity: request.pickedUpQuantity ?? 0,
        returnedQuantity: request.returnedQuantity,
        outstandingQuantity: Math.max(
          0,
          (request.pickedUpQuantity ?? 0) - (request.returnedQuantity ?? 0),
        ),
      }))
      .filter((item) => item.outstandingQuantity > 0);
  }

  /**
   * Nén từng ảnh rồi cất vào kho ngoài, trả về đúng phần sẽ ghi xuống DB.
   *
   * Có kho ngoài thì hàng trong DB chỉ giữ khoá vật thể; chưa cấu hình kho (máy
   * dev, máy chạy ngoại tuyến) thì giữ bytes ngay trong hàng. Cả hai đường đều
   * chạy được, nên thiếu một biến môi trường không làm mất tính năng.
   */
  private async storeDeliveryPhotos(
    missionId: string,
    userId: string,
    photos: DecodedDeliveryPhoto[],
  ): Promise<{ rows: Prisma.MissionDeliveryPhotoCreateManyInput[]; uploadedKeys: string[] }> {
    const rows: Prisma.MissionDeliveryPhotoCreateManyInput[] = [];
    const uploadedKeys: string[] = [];
    for (const photo of photos) {
      const optimized = await optimizeDeliveryPhoto(photo);
      const photoId = randomUUID();
      if (this.evidenceStorage.enabled) {
        const storageKey = await this.evidenceStorage.upload(
          missionId,
          photoId,
          optimized.data,
          optimized.mimeType,
        );
        uploadedKeys.push(storageKey);
        rows.push({
          id: photoId,
          missionId,
          storageKey,
          mimeType: optimized.mimeType,
          byteSize: optimized.byteSize,
          uploadedByUserId: userId,
        });
        continue;
      }
      rows.push({
        id: photoId,
        missionId,
        data: optimized.data,
        mimeType: optimized.mimeType,
        byteSize: optimized.byteSize,
        uploadedByUserId: userId,
      });
    }
    return { rows, uploadedKeys };
  }

  /**
   * Bytes của một ảnh bằng chứng, để trả về theo đường có kiểm quyền.
   *
   * Đi qua `getMission` chứ không tra thẳng bảng ảnh: quyền xem ảnh là quyền xem
   * chính nhiệm vụ đó, và luật phạm vi (cùng tổ chức, đúng kho) đã nằm trọn ở
   * đó. Tra thẳng theo id ảnh là mở một đường vòng không có luật nào canh.
   */
  async getDeliveryPhoto(
    missionId: string,
    photoId: string,
    actorUserId?: string,
    scopeWarehouseId?: string | null,
  ) {
    await this.getMission(missionId, actorUserId, scopeWarehouseId);
    const photo = await this.prisma.missionDeliveryPhoto.findFirst({
      where: { id: photoId, missionId },
    });
    if (!photo) throw new NotFoundException("Không tìm thấy ảnh bằng chứng");
    // Ảnh cũ (lưu trước khi bật kho ngoài) vẫn nằm trong DB, nên phải đọc được cả
    // hai đường — không có bước chuyển kho nào bắt buộc trước khi xem lại.
    const data = photo.storageKey
      ? await this.evidenceStorage.download(photo.storageKey)
      : Buffer.from(photo.data ?? []);
    return { id: photo.id, mimeType: photo.mimeType, byteSize: data.length, data };
  }

  /**
   * Bản ghi âm của một báo cáo, trả về đúng bytes đã nhận.
   *
   * Đi qua `getMission` trước để dùng lại NGUYÊN bộ kiểm tra phạm vi ở đó: chép
   * ra một bản kiểm tra thứ hai là chỗ để lọt báo cáo của xã khác.
   */
  async getReportAudio(
    missionId: string,
    actorUserId?: string,
    scopeWarehouseId?: string | null,
  ) {
    await this.getMission(missionId, actorUserId, scopeWarehouseId);
    const audio = await this.prisma.missionReportAudio.findUnique({ where: { missionId } });
    if (!audio) throw new NotFoundException("Báo cáo này không có bản ghi âm");
    return {
      id: audio.id,
      mimeType: audio.mimeType,
      byteSize: audio.byteSize,
      data: Buffer.from(audio.data),
    };
  }

  /**
   * Hộp nhiệm vụ có phân trang — lọc, xếp và cắt trang ĐỀU ở tầng SQL.
   *
   * Trước đây web tải 100 nhiệm vụ mới nhất rồi tự lọc/xếp/cắt trang. Cách đó sai
   * ngay từ gốc khi số nhiệm vụ vượt 100: "nhiệm vụ cũ nhất" không bao giờ nằm
   * trong 100 cái mới nhất, nên cách xếp "cũ nhất trước" chỉ xếp lại đúng phần đã
   * tải và không bao giờ ra được nhiệm vụ số 1. Cắt trang cũng phải làm cùng chỗ
   * với lọc và xếp, nếu không trang 2 là hai thứ khác nhau tuỳ ai cắt.
   */
  async listMissionsPage(params: {
    page?: number;
    pageSize?: number;
    sort?: MissionListSort;
    filter?: MissionListFilter;
    search?: string;
    searchField?: MissionSearchField;
    actorUserId: string;
    role: UserRole;
    scopeWarehouseId?: string | null;
  }) {
    const actor = await this.prisma.user.findUnique({
      where: { id: params.actorUserId },
      select: { organizationId: true },
    });
    if (!actor) throw new NotFoundException("Không tìm thấy người dùng");

    // Phạm vi nhìn thấy: giống hệt `listMissions`, tách ra để hai mệnh đề đếm và
    // lấy dùng CHUNG một định nghĩa — lệch nhau thì tổng số trang không khớp với
    // số dòng thật và trang cuối hiện ra trống.
    const scope: Prisma.MissionWhereInput = {
      warehouse: { organizationId: actor.organizationId },
      ...(params.scopeWarehouseId
        ? {
            OR: [
              { warehouseId: params.scopeWarehouseId },
              { warehousePreparations: { some: { warehouseId: params.scopeWarehouseId } } },
            ],
          }
        : {}),
    };

    const conditions: Prisma.MissionWhereInput[] = [];
    if (params.filter === "needs-action") {
      const statuses = needsActionStatuses(params.role);
      conditions.push({ status: { in: statuses } });
      // Kho đã xuất xong phần của mình thì hết việc, dù nhiệm vụ vẫn đang chờ các
      // kho khác. Không có vế này thì mọi kho đều thấy "cần xử lý" tới lúc nhiệm
      // vụ đóng.
      if (params.role === UserRole.WAREHOUSE && params.scopeWarehouseId) {
        conditions.push({
          warehousePreparations: {
            some: { warehouseId: params.scopeWarehouseId, preparedAt: null },
          },
        });
      }
    }
    if (params.filter === "published") {
      conditions.push({ status: { notIn: [MissionStatus.DRAFT, MissionStatus.CANCELLED] } });
    }

    const search = params.search?.trim();
    if (search) {
      const field = params.searchField ?? "text";
      if (field === "mission-no" || field === "affected-people") {
        // Hai trường này là SỐ. Gõ dở "1" khi định gõ "12" vẫn là một con số hợp
        // lệ nên cứ tìm; còn gõ chữ vào ô số thì không có gì để so — trả về rỗng
        // thay vì lặng lẽ bỏ qua bộ lọc và đưa ra cả trăm dòng không liên quan.
        const value = Number.parseInt(search, 10);
        if (!Number.isFinite(value)) {
          conditions.push({ id: "__khong-khop__" });
        } else if (field === "mission-no") {
          conditions.push({ missionNo: value });
        } else {
          conditions.push({ affectedPeople: value });
        }
      } else {
        conditions.push({
          OR: [
            { location: { contains: search, mode: "insensitive" } },
            { hamletName: { contains: search, mode: "insensitive" } },
            { reportText: { contains: search, mode: "insensitive" } },
            { incidentType: { contains: search, mode: "insensitive" } },
          ],
        });
      }
    }

    const where: Prisma.MissionWhereInput =
      conditions.length > 0 ? { AND: [scope, ...conditions] } : scope;

    const pageSize = Math.min(Math.max(Math.trunc(params.pageSize ?? 15) || 15, 1), MAX_PAGE_SIZE);
    const [total, totalAll] = await Promise.all([
      this.prisma.mission.count({ where }),
      // Con số cạnh chữ "Hộp nhiệm vụ": tổng nhiệm vụ người này nhìn thấy được,
      // KHÔNG theo bộ lọc đang bật — nó trả lời "hộp này có bao nhiêu", không
      // phải "bộ lọc vừa rồi khớp bao nhiêu" (câu đó do phân trang trả lời).
      this.prisma.mission.count({ where: scope }),
    ]);
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    // Xin trang 9 khi chỉ còn 3 trang (vừa lọc hẹp lại) thì kéo về trang cuối,
    // thay vì trả mảng rỗng khiến người dùng tưởng lọc ra không có gì.
    const page = Math.min(Math.max(Math.trunc(params.page ?? 1) || 1, 1), totalPages);

    const items = await this.prisma.mission.findMany({
      where,
      orderBy: missionOrderBy(params.sort ?? "newest"),
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        requirements: true,
        warehousePreparations: true,
        warehouseRequests: {
          include: { warehouse: { select: { id: true, name: true } } },
          orderBy: [{ warehouseId: "asc" }, { sku: "asc" }],
        },
        ...COORDINATION_ANALYSIS_COUNT,
      },
    });

    return {
      items: await this.withReturnableSupplyFlags(items.map(withCoordinationAnalysisFlag)),
      total,
      totalAll,
      page,
      pageSize,
      totalPages,
    };
  }

  /**
   * Tra nhiệm vụ theo SỐ HIỆU, cho đường dẫn dạng /missions/nhiem-vu-98.
   *
   * `id` là cuid — đúng cho máy nhưng không ai đọc được trên thanh địa chỉ. Số
   * hiệu là thứ người trực gọi cho nhau, nên nó mới là thứ đáng nằm trên URL.
   *
   * Dùng lại `getMission` để phần kiểm tra phạm vi (cùng tổ chức, đúng kho) chỉ
   * có MỘT bản: chép ra bản thứ hai là chỗ để lọt nhiệm vụ của xã khác.
   */
  async getMissionByNo(missionNo: number, actorUserId?: string, scopeWarehouseId?: string | null) {
    const found = await this.prisma.mission.findUnique({
      where: { missionNo },
      select: { id: true },
    });
    if (!found) throw new NotFoundException("Không tìm thấy nhiệm vụ");
    return this.getMission(found.id, actorUserId, scopeWarehouseId);
  }

  /**
   * Danh sách nhiệm vụ (lọc theo trạng thái nếu truyền) — mới nhất trước.
   *
   * `page.cursor` + `page.limit` cho lối cuộn vô tận của điện thoại: con trỏ là id
   * nhiệm vụ CUỐI trang trước. Bỏ trống thì vẫn trả 100 nhiệm vụ mới nhất như
   * trước, nên các màn hình đọc một phát cả danh sách không phải sửa gì.
   *
   * Sắp xếp thêm `id` sau `createdAt`: một lượt seed hoặc một lượt nhập hàng loạt
   * sinh ra nhiều nhiệm vụ trong cùng mili giây, và con trỏ rơi vào giữa cụm đó
   * thì trang sau lặp lại hoặc nhảy cóc mất vài dòng.
   */
  async listMissions(
    statuses?: MissionStatus[],
    actorUserId?: string,
    scopeWarehouseId?: string | null,
    page: { limit?: number; cursor?: string } = {},
  ) {
    const actor = actorUserId
      ? await this.prisma.user.findUnique({
          where: { id: actorUserId },
          select: { organizationId: true },
        })
      : null;
    if (actorUserId && !actor) throw new NotFoundException("Không tìm thấy người dùng");
    const requested = Number.isFinite(page.limit) ? Math.trunc(page.limit as number) : 100;
    const limit = Math.min(Math.max(requested, 1), 100);
    const cursor = page.cursor?.trim();
    const missions = await this.prisma.mission.findMany({
      where: {
        ...(statuses && statuses.length > 0 ? { status: { in: statuses } } : {}),
        ...(scopeWarehouseId
          ? {
              OR: [
                { warehouseId: scopeWarehouseId },
                { warehousePreparations: { some: { warehouseId: scopeWarehouseId } } },
              ],
            }
          : {}),
        ...(actor ? { warehouse: { organizationId: actor.organizationId } } : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: {
        requirements: true,
        warehousePreparations: true,
        warehouseRequests: {
          include: { warehouse: { select: { id: true, name: true } } },
          orderBy: [{ warehouseId: "asc" }, { sku: "asc" }],
        },
        ...COORDINATION_ANALYSIS_COUNT,
      },
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      take: limit,
    });
    return missions.map((mission) => withCoordinationAnalysisFlag(withCurrentFulfillment(mission)));
  }

  /**
   * Lịch sử báo cáo text của chính trưởng thôn. Không dùng listMissions vì
   * reporter không được nhìn thấy nhiệm vụ của người khác trong cùng xã.
   * Cursor chỉ là id mission đã trả ở trang trước; page size bị chặn tối đa 50.
   */
  async listOwnReports(
    actorUserId: string,
    scopeWarehouseId?: string | null,
    cursor?: string,
    requestedLimit?: number,
  ) {
    const actor = await this.prisma.user.findUnique({
      where: { id: actorUserId },
      select: { organizationId: true },
    });
    if (!actor) throw new NotFoundException("Không tìm thấy người dùng");
    const requested = Number.isFinite(requestedLimit) ? Math.trunc(requestedLimit as number) : 20;
    const limit = Math.min(Math.max(requested, 1), 50);
    const rows = await this.prisma.mission.findMany({
      where: {
        createdByUserId: actorUserId,
        ...(scopeWarehouseId ? { warehouseId: scopeWarehouseId } : {}),
        warehouse: { organizationId: actor.organizationId },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      take: limit + 1,
      include: {
        warehouse: { select: { id: true, name: true } },
        requirements: {
          select: {
            id: true,
            sku: true,
            itemName: true,
            required: true,
            allocated: true,
            shortage: true,
            unit: true,
          },
        },
      },
    });
    const hasNext = rows.length > limit;
    const items = hasNext ? rows.slice(0, limit) : rows;
    return {
      items,
      nextCursor: hasNext ? (items[items.length - 1]?.id ?? null) : null,
    };
  }

  /** Chi tiết báo cáo text của chính trưởng thôn; không trả media/audio/GPS liên tục. */
  async getOwnReport(missionId: string, actorUserId: string, scopeWarehouseId?: string | null) {
    const actor = await this.prisma.user.findUnique({
      where: { id: actorUserId },
      select: { organizationId: true },
    });
    if (!actor) throw new NotFoundException("Không tìm thấy người dùng");
    const report = await this.prisma.mission.findFirst({
      where: {
        id: missionId,
        createdByUserId: actorUserId,
        ...(scopeWarehouseId ? { warehouseId: scopeWarehouseId } : {}),
        warehouse: { organizationId: actor.organizationId },
      },
      include: {
        warehouse: { select: { id: true, name: true } },
        requirements: {
          select: {
            id: true,
            sku: true,
            itemName: true,
            required: true,
            allocated: true,
            shortage: true,
            unit: true,
          },
        },
        fieldUpdates: {
          select: { id: true, confirmedText: true, inputMode: true, createdAt: true },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    if (!report) throw new NotFoundException("Không tìm thấy báo cáo");
    return report;
  }

  /**
   * WAREHOUSE chuẩn bị đúng phần được phân bổ cho kho mình. Mỗi kho claim một
   * preparation row trong cùng transaction với xuất kho; retry không thể xuất
   * lần hai. Mission chỉ READY khi không còn kho tham gia nào chưa hoàn tất.
   */
  async prepareByWarehouse(id: string, userId: string, scopeWarehouseId?: string | null) {
    const warehouseId = await this.resolvePreparationWarehouseId(userId, scopeWarehouseId);
    const result = await this.prisma.$transaction(async (tx) => {
      const mission = await tx.mission.findUnique({
        where: { id },
        include: {
          requirements: true,
          warehousePreparations: true,
          _count: { select: { warehouseRequests: true } },
        },
      });
      if (!mission) throw new NotFoundException("Không tìm thấy nhiệm vụ");
      if (mission._count?.warehouseRequests > 0) {
        throw new BadRequestException(
          "Nhiệm vụ này chuẩn bị theo từng vật tư; vui lòng dùng danh sách yêu cầu SKU",
        );
      }

      let preparation =
        mission.warehousePreparations.find((item) => item.warehouseId === warehouseId) ?? null;
      // Tương thích mission PENDING_WAREHOUSE đã tồn tại trước khi triển khai bảng tiến độ.
      if (mission.warehousePreparations.length === 0) {
        const participantIds = missionParticipantWarehouseIds(
          mission.requirements,
          mission.warehouseId,
        );
        const legacyPreparedAt = mission.status === MissionStatus.READY ? new Date() : null;
        await tx.missionWarehousePreparation.createMany({
          data: participantIds.map((participantWarehouseId) => ({
            missionId: id,
            warehouseId: participantWarehouseId,
            preparedAt: legacyPreparedAt,
          })),
          skipDuplicates: true,
        });
        if (participantIds.includes(warehouseId)) {
          preparation = await tx.missionWarehousePreparation.findUnique({
            where: { missionId_warehouseId: { missionId: id, warehouseId } },
          });
        }
      }
      if (!preparation) {
        // Từ chối truy cập, không phải dữ liệu gửi lên sai: kho này không nằm
        // trong nhiệm vụ đó. Trả 403 để chặn dò tìm nhiệm vụ của kho khác.
        throw new ForbiddenException("Kho của bạn không được phân bổ vật tư trong nhiệm vụ này");
      }

      // Retry sau khi kho này đã commit là idempotent, kể cả mission còn chờ kho khác.
      if (preparation.preparedAt) {
        const current = await tx.mission.findUniqueOrThrow({
          where: { id },
          include: { requirements: true, warehousePreparations: true },
        });
        return {
          mission: current,
          prepared: false,
          becameReady: false,
          batchIds: [] as string[],
        };
      }
      this.guardTransition(mission.status, MissionStatus.READY);

      const preparedAt = new Date();
      const claim = await tx.missionWarehousePreparation.updateMany({
        where: {
          missionId: id,
          warehouseId,
          preparedAt: null,
        },
        data: { preparedByUserId: userId, preparedAt },
      });
      if (claim.count === 0) {
        const currentPreparation = await tx.missionWarehousePreparation.findUnique({
          where: { missionId_warehouseId: { missionId: id, warehouseId } },
        });
        if (currentPreparation?.preparedAt) {
          const current = await tx.mission.findUniqueOrThrow({
            where: { id },
            include: { requirements: true, warehousePreparations: true },
          });
          return {
            mission: current,
            prepared: false,
            becameReady: false,
            batchIds: [] as string[],
          };
        }
        throw new BadRequestException("Kho đang được chuẩn bị, vui lòng thử lại");
      }

      const items = collectMissionBatchesForWarehouse(
        mission.requirements,
        warehouseId,
        mission.warehouseId,
      );
      if (items.length > 0) {
        await this.inventory.bulkExportInTx(tx, userId, items, `Nhiệm vụ ${id}`, warehouseId);
      }

      // Serialize bước đếm cuối trên mission row để hai kho hoàn tất đồng thời
      // không thể cùng nhìn thấy kho kia còn PENDING rồi bỏ sót transition READY.
      await tx.$queryRaw`SELECT "id" FROM "Mission" WHERE "id" = ${id} FOR UPDATE`;
      const remaining = await tx.missionWarehousePreparation.count({
        where: { missionId: id, preparedAt: null },
      });
      let becameReady = false;
      if (remaining === 0) {
        const readyClaim = await tx.mission.updateMany({
          where: { id, status: MissionStatus.PENDING_WAREHOUSE },
          data: { status: MissionStatus.READY },
        });
        if (readyClaim.count === 0) {
          const current = await tx.mission.findUnique({ where: { id } });
          if (!current) throw new NotFoundException("Không tìm thấy nhiệm vụ");
          if (current.status !== MissionStatus.READY) {
            this.guardTransition(current.status, MissionStatus.READY);
            throw new BadRequestException("Nhiệm vụ vừa được cập nhật, vui lòng tải lại");
          }
        } else {
          becameReady = true;
        }
      }

      const updated = await tx.mission.findUniqueOrThrow({
        where: { id },
        include: { requirements: true, warehousePreparations: true },
      });
      return {
        mission: updated,
        prepared: true,
        becameReady,
        batchIds: items.map((item) => item.batchId),
      };
    });

    if (!result.prepared) return result.mission;

    // Hậu xử lý không được làm client hiểu nhầm transaction đã rollback và retry.
    await this.inventory.recalcBatches(result.batchIds).catch((error) => {
      this.log.warn(`Recalc readiness sau prepare ${id} lỗi: ${errorMessage(error)}`);
    });
    if (result.becameReady) {
      const notifications = await Promise.allSettled(
        [UserRole.ADMIN, UserRole.RESCUE].map((role) =>
          this.notifications.create({
            recipientRole: role,
            kind: NotificationKind.WAREHOUSE_READY,
            title: "Các kho đã chuẩn bị xong",
            body: `Vật tư cho ${result.mission.incidentType} đã sẵn sàng giao cho ${FIELD_FORCE_ROLE_LABEL}.`,
            missionId: id,
          }),
        ),
      );
      for (const notification of notifications) {
        if (notification.status === "rejected") {
          this.log.warn(
            `Tạo thông báo sau prepare ${id} lỗi: ${errorMessage(notification.reason)}`,
          );
        }
      }
    }
    return result.mission;
  }

  private async resolvePreparationWarehouseId(
    userId: string,
    scopeWarehouseId?: string | null,
  ): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { warehouseId: true },
    });
    if (!user?.warehouseId) {
      throw new BadRequestException("Tài khoản kho chưa được gán kho phụ trách");
    }
    assertWarehouseInScope(scopeWarehouseId, user.warehouseId);
    return user.warehouseId;
  }

  /**
   * Ghi state bằng compare-and-swap để request cũ không thể ghi đè một transition
   * mới hơn. Giữ nguyên state machine/error contract của từng endpoint.
   */
  private async updateMissionIfCurrent(
    id: string,
    expectedStatus: MissionStatus,
    data: Prisma.MissionUpdateManyMutationInput,
    transitionTarget: MissionStatus,
  ) {
    const updated = await this.prisma.mission.updateMany({
      where: { id, status: expectedStatus },
      data,
    });
    if (updated.count === 0) {
      const current = await this.requireMission(id);
      this.guardTransition(current.status, transitionTarget);
      throw new BadRequestException("Nhiệm vụ vừa được cập nhật, vui lòng tải lại");
    }
    return this.prisma.mission.findUniqueOrThrow({ where: { id } });
  }

  /**
   * Cancel/reject ở PENDING_WAREHOUSE phải serialize với prepare. Nếu một kho đã
   * commit xuất, không được kết thúc mission mà bỏ quên tồn kho đã trừ.
   */
  private async updatePendingWarehouseMissionBeforeExport(
    id: string,
    data: Prisma.MissionUpdateManyMutationInput,
    transitionTarget: MissionStatus,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Mission" WHERE "id" = ${id} FOR UPDATE`;
      const [preparedWarehouseCount, preparedRequestCount] = await Promise.all([
        tx.missionWarehousePreparation.count({
          where: { missionId: id, preparedAt: { not: null } },
        }),
        // Kể cả phần đã có người ký nhận mang đi: hàng đã rời kho thì việc dừng
        // nhiệm vụ phải đi qua đường hoàn kho, không dừng ngang được nữa.
        tx.missionWarehouseRequest.count({
          where: { missionId: id, status: { in: [...EXPORTED_REQUEST_STATUSES] } },
        }),
      ]);
      if (preparedWarehouseCount > 0 || preparedRequestCount > 0) {
        throw new BadRequestException(
          "Không thể dừng nhiệm vụ vì đã có kho xuất vật tư; cần hoàn kho hoặc hoàn tất giao nhận",
        );
      }
      const updated = await tx.mission.updateMany({
        where: { id, status: MissionStatus.PENDING_WAREHOUSE },
        data,
      });
      if (updated.count === 0) {
        const current = await tx.mission.findUnique({ where: { id } });
        if (!current) throw new NotFoundException("Không tìm thấy nhiệm vụ");
        this.guardTransition(current.status, transitionTarget);
        throw new BadRequestException("Nhiệm vụ vừa được cập nhật, vui lòng tải lại");
      }
      return tx.mission.findUniqueOrThrow({ where: { id } });
    });
  }

  /**
   * Nhiệm vụ phải thuộc ĐÚNG đơn vị của người đang bấm.
   *
   * `assertWarehouseInScope` một mình không đủ: nó chỉ chặn được người có scope
   * kho (trưởng thôn). Điều phối xã và lực lượng hiện trường đều mang scope rỗng,
   * nên trước đây chỉ cần biết id nhiệm vụ là huỷ hoặc đóng được nhiệm vụ của xã
   * bên cạnh — mà đóng với kết quả "không giao được" còn kéo theo một lượt hoàn
   * kho vào kho của xã đó.
   *
   * Trả 404 chứ không 403: xác nhận "có nhiệm vụ này nhưng anh không được đụng"
   * cũng đã là rò rỉ, và người dùng hợp lệ thì không bao giờ gặp nhánh này.
   */
  private async assertActorInMissionOrganization(
    actorUserId: string | undefined,
    missionWarehouseId: string,
  ): Promise<void> {
    if (!actorUserId) return;
    const [actor, warehouse] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: actorUserId },
        select: { organizationId: true },
      }),
      this.prisma.warehouse.findUnique({
        where: { id: missionWarehouseId },
        select: { organizationId: true },
      }),
    ]);
    if (!actor || !warehouse || actor.organizationId !== warehouse.organizationId) {
      throw new NotFoundException("Không tìm thấy nhiệm vụ");
    }
  }

  private async requireMission(id: string, scopeWarehouseId?: string | null) {
    const mission = await this.prisma.mission.findUnique({ where: { id } });
    if (!mission) throw new NotFoundException("Không tìm thấy nhiệm vụ");
    assertWarehouseInScope(scopeWarehouseId, mission.warehouseId);
    return mission;
  }

  /** Bọc chuyển tiếp state machine → BadRequest (không phải 500). */
  private guardTransition(from: MissionStatus, to: MissionStatus) {
    try {
      assertTransition(from, to);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
  }

  /**
   * Phần phương án đòi nhiều hơn thứ kho còn thật sự có.
   *
   * Dùng lại `loadClusterBatches` để "còn thật sự có" chỉ có MỘT định nghĩa —
   * cùng bộ lọc lô đủ điều kiện, cùng phép trừ hàng đã hứa. Loại chính nhiệm vụ
   * này ra khỏi phần đã hứa: nó chưa phát hành nên chưa giữ chỗ của ai.
   */
  /**
   * Phần phương án đòi nhiều hơn thứ kho còn thật sự có.
   *
   * Cố ý HẸP: không thẩm định lại toàn bộ điều kiện lô (hạn dùng, tình trạng, kệ
   * khoá) — việc đó đã làm lúc lập phương án và là việc của lượt tính lại. Ở đây
   * chỉ trả lời đúng một câu: từ lúc lập phương án tới giờ, có ai lấy mất phần
   * hàng này không. Hỏi hẹp thì rẻ, và chạy được ngay trong đường phát hành mà
   * không kéo theo cả bộ máy tính tuyến, điểm sẵn sàng và khoảng cách.
   */
  private async detectCommitmentShortfalls(
    missionId: string,
    planned: {
      warehouseId: string;
      sku: string;
      itemName: string;
      unit: string;
      requestedQuantity: number;
    }[],
  ): Promise<Shortfall[]> {
    if (planned.length === 0) return [];
    const warehouseIds = [...new Set(planned.map((row) => row.warehouseId))];
    const skus = [...new Set(planned.map((row) => row.sku))];

    const [batches, commitments, warehouses] = await Promise.all([
      this.prisma.itemBatch.findMany({
        where: {
          item: { sku: { in: skus } },
          shelf: { zone: { warehouseId: { in: warehouseIds } } },
        },
        select: {
          quantity: true,
          item: { select: { sku: true } },
          shelf: { select: { zone: { select: { warehouseId: true } } } },
          loans: {
            where: { status: { in: [LoanStatus.ON_LOAN, LoanStatus.PARTIALLY_RETURNED] } },
            select: { quantity: true, returnedOk: true, returnedDamaged: true, lost: true },
          },
        },
      }),
      this.openCommitments(warehouseIds, skus, missionId),
      this.prisma.warehouse.findMany({
        where: { id: { in: warehouseIds } },
        select: { id: true, name: true },
      }),
    ]);

    const remaining = new Map<string, number>();
    for (const batch of batches) {
      const warehouseId = batch.shelf?.zone.warehouseId;
      if (!warehouseId) continue;
      // Hàng đang cho mượn vẫn nằm trong `quantity` nhưng không lấy ra được.
      const onLoan = batch.loans.reduce(
        (sum, loan) => sum + (loan.quantity - loan.returnedOk - loan.returnedDamaged - loan.lost),
        0,
      );
      const key = commitmentKey(warehouseId, batch.item.sku);
      remaining.set(key, (remaining.get(key) ?? 0) + Math.max(batch.quantity - onLoan, 0));
    }

    const names = new Map(warehouses.map((row) => [row.id, row.name]));
    return planned
      .map((row) => {
        const key = commitmentKey(row.warehouseId, row.sku);
        const physicalStock = remaining.get(key) ?? 0;
        const promisedToOthers = commitments.get(key) ?? 0;
        return {
          warehouseId: row.warehouseId,
          warehouseName: names.get(row.warehouseId) ?? "Kho",
          sku: row.sku,
          itemName: row.itemName,
          unit: row.unit,
          requested: row.requestedQuantity,
          stillAvailable: Math.max(physicalStock - promisedToOthers, 0),
          physicalStock,
          promisedToOthers,
        };
      })
      .filter((row) => row.stillAvailable < row.requested);
  }

  /**
   * Tính lại phương án theo tồn còn thật, sau khi phát hiện hàng đã bị nhận trước.
   *
   * Dựng lại tình huống từ chính bản ghi nhiệm vụ rồi đi qua đúng đường lập phương
   * án thường ngày, nên phần phân bổ mới trải sang kho khác theo cùng một quy tắc.
   * Hỏng ở bước này thì NUỐT lỗi: người dùng đã có câu báo thiếu hàng — thay nó
   * bằng một lỗi kỹ thuật của bước phụ là giấu mất thứ họ cần biết.
   */
  private async replanAfterShortfall(
    missionId: string,
    actorUserId?: string,
    scopeWarehouseId?: string | null,
  ): Promise<void> {
    try {
      const mission = await this.prisma.mission.findUnique({ where: { id: missionId } });
      if (!mission) return;
      const parsed = (mission.parsedInput ?? {}) as {
        children?: number;
        elderly?: number;
        medicalSupportCases?: number;
      };
      await this.planFromReport(
        missionId,
        {
          incidentType: mission.incidentType as IncidentType,
          location: mission.location,
          affectedPeople: mission.affectedPeople,
          durationHours: mission.durationHours,
          children: parsed.children ?? 0,
          elderly: parsed.elderly ?? 0,
          medicalSupportCases: parsed.medicalSupportCases ?? 0,
        },
        mission.incidentLat != null && mission.incidentLng != null
          ? { lat: mission.incidentLat, lng: mission.incidentLng }
          : undefined,
        actorUserId,
        scopeWarehouseId,
      );
    } catch (error) {
      this.log.warn(
        `Không tính lại được phương án cho nhiệm vụ ${missionId} sau khi thiếu hàng: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /** Ảnh chụp đánh giá có đang nói "không điều phối được" không. */
  private isNotDispatchable(value: Prisma.JsonValue | null): boolean {
    if (!value) return false;
    return (value as unknown as MissionReadinessAssessment).status === "NOT_DISPATCHABLE";
  }

  /** Tính lại phương án rồi đọc lại bản ghi, để chặn theo số liệu của HÔM NAY. */
  private async refreshMissionForApproval(
    missionId: string,
    userId: string,
    scopeWarehouseId?: string | null,
  ) {
    await this.replanAfterShortfall(missionId, userId, scopeWarehouseId);
    const refreshed = await this.prisma.mission.findUnique({
      where: { id: missionId },
      include: { requirements: true },
    });
    if (!refreshed) throw new NotFoundException("Không tìm thấy nhiệm vụ");
    return refreshed;
  }

  private assertMissionDispatchable(value: Prisma.JsonValue | null, requirementCount: number) {
    if (!value || requirementCount === 0) {
      throw new BadRequestException("Chưa thể điều phối báo cáo chưa được lập phương án.");
    }
    const assessment = value as unknown as MissionReadinessAssessment;
    if (assessment.status !== "NOT_DISPATCHABLE") return;
    const blocker = assessment.blockers[0];
    const reason = blocker
      ? `${blocker.itemName}: ${blocker.reasons[0] ?? "không có lô đủ điều kiện"}`
      : "Không đủ vật tư thiết yếu đủ điều kiện";
    // Nói VIỆC PHẢI LÀM chứ không chỉ nói đã chặn. Người trực đọc "chưa thể điều
    // phối" xong không biết bước kế tiếp, trong khi hệ thống có sẵn đường đi —
    // mượn xã lân cận rồi phát hành lại. Kho trong xã hết hàng không phải là hết
    // cách, đó là lúc phải hỏi xã bên cạnh.
    throw new BadRequestException(
      `Kho trong xã chưa đủ để phát hành — ${reason}. Hỏi mượn xã lân cận ở tab Mượn, trả rồi phát hành lại.`,
    );
  }

  private assertMissionHasIncidentPoint(mission: {
    incidentLat: number | null;
    incidentLng: number | null;
  }) {
    if (mission.incidentLat == null || mission.incidentLng == null) {
      throw new BadRequestException(
        "Cần xác nhận địa điểm ứng phó trước khi lập kế hoạch hoặc điều phối nhiệm vụ.",
      );
    }
  }

  /**
   * Sinh Incident Action Plan (K3): backend chấm severity + forecasts bằng RULE
   * (chống LLM bịa) → gom context → LLM viết phần diễn giải → ghép → lưu.
   * LLM lỗi/mất mạng → template fallback (demo không bao giờ trắng màn hình).
   */
  async generateActionPlan(
    id: string,
    actorUserId?: string,
    scopeWarehouseId?: string | null,
  ): Promise<ActionPlan> {
    const mission = await this.prisma.mission.findUnique({
      where: { id },
      include: { requirements: true },
    });
    if (!mission) throw new NotFoundException("Không tìm thấy nhiệm vụ");

    await this.getMission(id, actorUserId, scopeWarehouseId);
    this.assertMissionHasIncidentPoint(mission);
    const incident = mission.parsedInput as unknown as IncidentInput;
    const fulfillment = mission.fulfillment;

    const allocations: AllocationSummary[] = mission.requirements.map((r) => ({
      sku: r.sku,
      itemName: r.itemName,
      unit: r.unit,
      required: r.required,
      allocated: r.allocated,
      shortage: r.shortage,
      fromWarehouses: warehouseNamesOf(r.allocations),
    }));

    const warehouses = await this.warehouseEtas(mission);
    // Loại trắng kho (cần mà lấy được 0) đi thẳng vào chấm mức khẩn cấp: mức đáp
    // ứng nay là trung bình theo loại nên nó không còn tự tụt xuống khi một loại
    // mất sạch — xem chú thích trong `scoreSeverity`.
    const unavailableItemNames = allocations
      .filter((allocation) => allocation.required > 0 && allocation.allocated === 0)
      .map((allocation) => allocation.itemName);
    const severity = scoreSeverity(incident, fulfillment, unavailableItemNames);
    const forecasts = computeForecasts(incident, fulfillment);

    // LLM viết phần diễn giải; lỗi → template.
    let narrative: ActionPlanNarrative;
    let generatedBy: ActionPlan["generatedBy"] = "ai";
    try {
      const context = buildActionPlanContext(
        incident,
        fulfillment,
        allocations,
        warehouses,
        severity,
        forecasts,
      );
      narrative = await this.ai.actionPlanNarrative(context);
    } catch {
      narrative = buildTemplateNarrative(incident, allocations);
      generatedBy = "template";
    }

    const plan: ActionPlan = {
      severityLevel: severity.level,
      severityReason: severity.reasons,
      fulfillment,
      allocations,
      warehouses,
      forecasts,
      narrative,
      generatedBy,
    };

    await this.prisma.mission.update({
      where: { id },
      data: { actionPlan: plan as unknown as Prisma.InputJsonValue },
    });
    return plan;
  }

  /** Tuyến local + ETA + đóng góp từ các kho đã cấp phát → điểm nạn. */
  private async warehouseEtas(mission: {
    warehouseId: string;
    incidentLat: number | null;
    incidentLng: number | null;
    requirements: {
      sku: string;
      itemName: string;
      unit: string;
      allocations: Prisma.JsonValue;
    }[];
  }): Promise<WarehouseEta[]> {
    const contributions = warehouseContributionsOf(mission.requirements);
    if (mission.incidentLat == null || mission.incidentLng == null || contributions.size === 0)
      return [];

    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id: mission.warehouseId },
    });
    const cluster = await this.prisma.warehouse.findMany({
      where: { communeId: warehouse?.communeId ?? "", id: { in: [...contributions.keys()] } },
    });
    const geolocated = cluster.filter((w) => w.lat != null && w.lng != null);
    if (geolocated.length === 0) return [];

    const dest = { lat: mission.incidentLat, lng: mission.incidentLng };
    return Promise.all(
      geolocated.map(async (w) => {
        const origin = { lat: w.lat as number, lng: w.lng as number };
        const route = await this.localRouting.route(origin, dest);
        return {
          id: w.id,
          name: w.name,
          kind: w.kind,
          distanceKm: route.distanceKm,
          etaMinutes: route.etaMinutes,
          lat: w.lat as number,
          lng: w.lng as number,
          routeStatus: route.status,
          routeGeometry: route.geometry,
          contributions: contributions.get(w.id) ?? [],
          engine: route.engine,
          graphVersion: route.graphVersion,
          routeProvenance: {
            engine: route.engine,
            graphVersion: route.graphVersion,
            calculatedAt: new Date().toISOString(),
            origin,
            destination: dest,
          },
        };
      }),
    );
  }

  /**
   * Tuyến từ các kho CÓ CẤP HÀNG tới điểm nạn — không chạy AI, không ghi gì.
   *
   * Trước đây tuyến chỉ tồn tại bên trong `actionPlan`, mà `actionPlan` chỉ sinh ra
   * ở `generateActionPlan` — bước lập bản tham mưu, có gọi LLM viết diễn giải. Hậu
   * quả trên màn hình điều phối: bấm tính nhu cầu xong, hệ thống đã biết chính xác
   * kho nào cấp gì, nhưng bản đồ vẫn trắng đường — người dùng thấy các chấm kho rời
   * rạc và không biết hàng đi đường nào tới chỗ nạn. Muốn thấy đường thì phải chờ
   * xong cả một lượt gọi LLM, cho một việc thuần hình học.
   *
   * Tách ra endpoint riêng chứ không nhét tuyến vào `generatePlan`: tính tuyến gọi
   * OSRM một lượt cho mỗi kho, để trong đường tạo nhiệm vụ là bắt người dùng chờ
   * thêm ngay ở bước họ cần nhanh nhất, và mỗi lần sửa số liệu lại chờ lại.
   *
   * Trả mảng rỗng (không ném) khi nhiệm vụ chưa có điểm nạn hoặc chưa cấp phát được
   * gì: bản đồ lúc đó vẫn phải vẽ được các kho, chỉ là chưa có đường nào để vẽ.
   */
  async warehouseRoutes(
    id: string,
    actorUserId?: string,
    scopeWarehouseId?: string | null,
  ): Promise<WarehouseEta[]> {
    // Đi qua `getMission` để dùng đúng một chỗ kiểm quyền xem nhiệm vụ; tự viết lại
    // điều kiện ở đây là sớm muộn cũng lệch với chỗ kia.
    const mission = await this.getMission(id, actorUserId, scopeWarehouseId);
    if (!mission) throw new NotFoundException("Không tìm thấy nhiệm vụ");
    return this.warehouseEtas(mission);
  }

  /** Toàn bộ kho (tổng + thôn) trong cụm xã, có toạ độ — cho map ghim điểm nạn (FE-K). */
  async listClusterWarehouses(
    warehouseId: string,
    actorUserId?: string,
    scopeWarehouseId?: string | null,
  ) {
    assertWarehouseInScope(scopeWarehouseId, warehouseId);
    const warehouse = await this.prisma.warehouse.findUnique({ where: { id: warehouseId } });
    if (!warehouse) throw new NotFoundException("Không tìm thấy kho");
    if (actorUserId) {
      const actor = await this.prisma.user.findUnique({
        where: { id: actorUserId },
        select: { organizationId: true },
      });
      if (!actor || actor.organizationId !== warehouse.organizationId) {
        throw new NotFoundException("Không tìm thấy kho");
      }
    }
    const cluster = await this.prisma.warehouse.findMany({
      where: {
        organizationId: warehouse.organizationId,
        communeId: warehouse?.communeId ?? "",
      },
    });
    return cluster
      .filter((w) => w.lat != null && w.lng != null)
      .map((w) => ({
        id: w.id,
        name: w.name,
        kind: w.kind,
        lat: w.lat as number,
        lng: w.lng as number,
      }));
  }

  // ---- gom dữ liệu ----

  /**
   * Lô khả dụng CẢ CỤM KHO cùng xã (K1): IN_STOCK, không hỏng, quantity > phần
   * đang mượn. Gắn khoảng cách đường bộ local kho→điểm nạn để greedy ưu tiên kho gần.
   * Không có điểm nạn / kho chưa ghim toạ độ → distanceKm=0 (không ưu tiên, chỉ FEFO).
   */
  private async loadClusterBatches(
    organizationId: string,
    communeId: string,
    requiredSkus: string[],
    incidentPoint?: LatLng,
    replanningMissionId?: string,
  ): Promise<{
    available: AvailableBatch[];
    unavailableReasonsBySku: Map<string, string[]>;
  }> {
    const warehouses = await this.prisma.warehouse.findMany({
      where: { organizationId, communeId },
    });
    const readinessByWarehouse = new Map(
      await Promise.all(
        warehouses.map(
          async (warehouse) =>
            [warehouse.id, await this.readiness.getWarehouseScore(warehouse.id)] as const,
        ),
      ),
    );

    // Khoảng cách mỗi kho → điểm nạn (1 lần cho cả cụm).
    const distanceByWarehouse = await this.distancesToIncident(warehouses, incidentPoint);

    const batches = await this.prisma.itemBatch.findMany({
      where: {
        shelf: { zone: { warehouseId: { in: warehouses.map((w) => w.id) } } },
        item: { sku: { in: requiredSkus } },
      },
      include: {
        item: true,
        shelf: { include: { zone: true } },
        loans: { where: { status: { in: ["ON_LOAN", "PARTIALLY_RETURNED"] } } },
      },
    });

    const nameById = new Map(warehouses.map((w) => [w.id, w.name]));
    const available: AvailableBatch[] = [];
    const unavailableReasonsBySku = new Map<string, string[]>();
    const now = new Date();

    for (const batch of batches) {
      const wid = batch.shelf?.zone.warehouseId;
      const sourceReadiness = wid ? readinessByWarehouse.get(wid) : null;
      if (sourceReadiness?.operationalStatus === "NOT_DISPATCHABLE") {
        const reason = sourceReadiness.blockers[0]?.title ?? "Kho nguồn chưa thể điều phối";
        addUnavailableReason(
          unavailableReasonsBySku,
          batch.item.sku,
          `${batch.batchCode}: ${reason}`,
        );
        continue;
      }

      const onLoan = batch.loans.reduce(
        (sum, loan) => sum + (loan.quantity - loan.returnedOk - loan.returnedDamaged - loan.lost),
        0,
      );
      const eligibility = assessBatchEligibility(
        {
          condition: batch.condition,
          circulation: batch.circulation,
          quantity: batch.quantity,
          onLoanQuantity: onLoan,
          expiryDate: batch.expiryDate,
          isLocked: batch.shelf?.isLocked ?? true,
        },
        now,
      );
      if (!eligibility.eligible) {
        for (const reason of eligibility.reasons) {
          addUnavailableReason(
            unavailableReasonsBySku,
            batch.item.sku,
            `${batch.batchCode}: ${reason}`,
          );
        }
        continue;
      }

      available.push({
        batchId: batch.id,
        sku: batch.item.sku,
        quantity: eligibility.availableQuantity,
        expiryDate: batch.expiryDate,
        warehouseId: wid,
        warehouseName: wid ? nameById.get(wid) : undefined,
        distanceKm: wid ? (distanceByWarehouse.get(wid) ?? 0) : 0,
      });
    }
    // Trừ phần đã hứa cho nhiệm vụ khác nhưng chưa rời kho. Không trừ thì phương
    // án mới lại hứa đúng số hàng đã có người đặt gạch, và cả hai cùng vỡ ở kho.
    const commitments = await this.openCommitments(
      warehouses.map((w) => w.id),
      requiredSkus,
      replanningMissionId,
    );
    const pruned = subtractCommitments(available, commitments);
    for (const item of pruned.consumedReasons) {
      addUnavailableReason(unavailableReasonsBySku, item.sku, item.reason);
    }
    return { available: pruned.available, unavailableReasonsBySku };
  }

  /**
   * Vật tư đã hứa cho nhiệm vụ khác nhưng chưa rời kho, theo (kho, SKU).
   *
   * Chỉ tính PENDING và ACCEPTED: từ PREPARED trở đi hàng đã được trừ khỏi
   * `ItemBatch.quantity` rồi, cộng thêm lần nữa là trừ hai lần cùng một số hàng.
   * Nhiệm vụ đã hoàn tất hoặc đã huỷ thì không còn giữ chỗ.
   */
  private async openCommitments(
    warehouseIds: string[],
    skus: string[],
    excludeMissionId?: string,
  ): Promise<Map<string, number>> {
    if (warehouseIds.length === 0 || skus.length === 0) return new Map();
    const rows = await this.prisma.missionWarehouseRequest.findMany({
      where: {
        warehouseId: { in: warehouseIds },
        sku: { in: skus },
        status: {
          in: [MissionWarehouseRequestStatus.PENDING, MissionWarehouseRequestStatus.ACCEPTED],
        },
        mission: { status: { notIn: [MissionStatus.COMPLETED, MissionStatus.CANCELLED] } },
        ...(excludeMissionId ? { missionId: { not: excludeMissionId } } : {}),
      },
      select: { warehouseId: true, sku: true, requestedQuantity: true },
    });
    return commitmentMap(
      rows.map((row) => ({
        warehouseId: row.warehouseId,
        sku: row.sku,
        quantity: row.requestedQuantity,
      })),
    );
  }

  /** Khoảng cách mỗi kho → điểm nạn. Kho thiếu lat/lng → dùng distanceKm ghim tay. */
  private async distancesToIncident(
    warehouses: { id: string; lat: number | null; lng: number | null; distanceKm: number }[],
    incidentPoint?: LatLng,
  ): Promise<Map<string, number>> {
    const result = new Map<string, number>();
    if (!incidentPoint) {
      for (const w of warehouses) result.set(w.id, w.distanceKm);
      return result;
    }

    const geolocated = warehouses.filter((w) => w.lat != null && w.lng != null);
    const localRoutes = await Promise.all(
      geolocated.map((w) =>
        this.localRouting.route({ lat: w.lat as number, lng: w.lng as number }, incidentPoint),
      ),
    );
    geolocated.forEach((w, i) => {
      const route = localRoutes[i];
      if (route.status === "ROUTED" && route.distanceKm != null) {
        result.set(w.id, route.distanceKm);
      }
    });

    // Kho chưa ghim toạ độ → fallback distanceKm thủ công.
    for (const w of warehouses) {
      if (!result.has(w.id)) result.set(w.id, w.distanceKm);
    }
    return result;
  }

  /**
   * Gợi ý kho lân cận có SKU thiếu — ưu tiên GẦN nhất (#30).
   * AI/hệ thống chỉ GỢI Ý; con người tự liên hệ + xuất đánh dấu.
   */
  private suggestNeighbors(
    sku: string,
    shortage: number,
    neighbors: { name: string; distanceKm: number; summary: Prisma.JsonValue }[],
  ): NeighborSuggestion[] {
    const suggestions: NeighborSuggestion[] = [];
    for (const neighbor of neighbors) {
      const items = (neighbor.summary as { sku: string; quantity: number }[]) ?? [];
      const match = items.find((item) => item.sku === sku);
      if (match && match.quantity > 0) {
        suggestions.push({
          name: neighbor.name,
          distanceKm: neighbor.distanceKm,
          available: Math.min(match.quantity, shortage),
        });
      }
    }
    return suggestions.sort((a, b) => a.distanceKm - b.distanceKm);
  }
}

interface MissionHamletPrisma {
  hamlet: {
    findMany(args: unknown): Promise<
      {
        id: string;
        name: string;
        // Bí danh đã chuẩn hoá ("long chau", "thon long chau"): cần khi dò tên
        // thôn ngay trong lời kể, vì người ta viết mỗi lần một kiểu.
        aliases: string[];
        lat: number | null;
        lng: number | null;
        verified: boolean;
      }[]
    >;
  };
}

/** Nhãn tiếng Việt cho kết quả giao — dùng trong nội dung thông báo. */
const DELIVERY_OUTCOME_LABEL: Record<DeliveryOutcome, string> = {
  [DeliveryOutcome.DELIVERED]: "Đã giao đủ",
  [DeliveryOutcome.PARTIAL]: "Giao một phần",
  [DeliveryOutcome.FAILED]: "Không giao được",
};

/**
 * Gom danh sách lô (batchId + quantity) từ allocations JSON của các requirement —
 * chính là phần vật tư ĐÃ CẤP. Dùng chung cho `prepare` (xuất kho) và `complete`
 * (hoàn kho khi giao thất bại) để 2 chiều luôn khớp đúng số lô.
 */
function collectMissionBatches(
  requirements: { allocations: Prisma.JsonValue }[],
): { batchId: string; quantity: number }[] {
  return requirements.flatMap((r) =>
    ((r.allocations as { batchId: string; qty: number }[]) ?? []).map((a) => ({
      batchId: a.batchId,
      quantity: a.qty,
    })),
  );
}

/**
 * Phần phải cộng trả về kho khi chuyến giao hỏng — tính theo thứ ĐÃ RỜI KHO.
 *
 * Không dùng thẳng phương án gốc được nữa: điều phối có quyền cắt bớt một phiếu
 * vật tư trước khi kho xuất (`review`), và lúc đó kho chỉ xuất đúng phần đã cắt
 * trong khi `MissionRequirement.allocations` vẫn giữ nguyên số cũ. Hoàn theo số
 * cũ là hệ thống tự đẻ ra hàng chưa từng rời kho: sổ nhiều hơn kệ, và sai lệch
 * chỉ lộ ra ở lượt kiểm kê sau, khi không còn ai nhớ chuyến nào gây ra nó.
 *
 * Nhiệm vụ chưa có phiếu theo SKU (dữ liệu cũ, chuẩn bị theo cả kho) thì phương
 * án gốc CHÍNH LÀ thứ đã xuất — đường đó giữ nguyên cách tính cũ.
 */
function collectRestockBatches(mission: {
  requirements: { allocations: Prisma.JsonValue }[];
  warehouseRequests: { status: MissionWarehouseRequestStatus; preparedAllocations: Prisma.JsonValue }[];
}): { batchId: string; quantity: number }[] {
  if (mission.warehouseRequests.length === 0) return collectMissionBatches(mission.requirements);
  return mission.warehouseRequests
    .filter((request) => isRequestExported(request.status))
    .flatMap((request) => requestBatchItems(request.preparedAllocations));
}

function collectMissionBatchesForWarehouse(
  requirements: { allocations: Prisma.JsonValue }[],
  warehouseId: string,
  sourceWarehouseId: string,
): { batchId: string; quantity: number }[] {
  return requirements.flatMap((requirement) =>
    (
      (requirement.allocations as {
        batchId?: string;
        qty?: number;
        warehouseId?: string;
      }[]) ?? []
    )
      .filter(
        (allocation) =>
          allocation.batchId &&
          Number.isFinite(allocation.qty) &&
          (allocation.qty ?? 0) > 0 &&
          (allocation.warehouseId ?? sourceWarehouseId) === warehouseId,
      )
      .map((allocation) => ({
        batchId: allocation.batchId as string,
        quantity: allocation.qty as number,
      })),
  );
}

function missionParticipantWarehouseIds(
  requirements: { allocations: Prisma.JsonValue }[],
  sourceWarehouseId: string,
): string[] {
  const warehouseIds = new Set<string>();
  for (const requirement of requirements) {
    const allocations =
      (requirement.allocations as
        | {
            batchId?: string;
            qty?: number;
            warehouseId?: string;
          }[]
        | null) ?? [];
    for (const allocation of allocations) {
      if (allocation.batchId && Number.isFinite(allocation.qty) && (allocation.qty ?? 0) > 0) {
        warehouseIds.add(allocation.warehouseId ?? sourceWarehouseId);
      }
    }
  }
  // Mission không có allocation vẫn cần một kho chịu trách nhiệm xác nhận hoàn tất.
  if (warehouseIds.size === 0) warehouseIds.add(sourceWarehouseId);
  return [...warehouseIds];
}

function assertMissionWarehouseInScope(
  scopeWarehouseId: string | null | undefined,
  mission: {
    warehouseId: string;
    warehousePreparations?: { warehouseId: string }[];
  },
) {
  if (
    !scopeWarehouseId ||
    mission.warehouseId === scopeWarehouseId ||
    mission.warehousePreparations?.some((item) => item.warehouseId === scopeWarehouseId)
  ) {
    return;
  }
  assertWarehouseInScope(scopeWarehouseId, mission.warehouseId);
}

function addUnavailableReason(reasonsBySku: Map<string, string[]>, sku: string, reason: string) {
  const reasons = reasonsBySku.get(sku) ?? [];
  if (!reasons.includes(reason)) reasons.push(reason);
  reasonsBySku.set(sku, reasons);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Tên các kho xuất hiện trong danh sách lô đã cấp (JSON allocations). */
function warehouseNamesOf(allocations: Prisma.JsonValue): string[] {
  const list = (allocations as { warehouseName?: string }[]) ?? [];
  const names = new Set<string>();
  for (const a of list) if (a.warehouseName) names.add(a.warehouseName);
  return [...names];
}

function warehouseContributionsOf(
  requirements: {
    sku?: string;
    itemName?: string;
    unit?: string;
    allocations: Prisma.JsonValue;
  }[],
): Map<string, { sku: string; itemName: string; quantity: number; unit: string }[]> {
  const grouped = new Map<
    string,
    Map<string, { sku: string; itemName: string; quantity: number; unit: string }>
  >();
  for (const requirement of requirements) {
    const allocations =
      (requirement.allocations as { warehouseId?: string; qty?: number }[] | null) ?? [];
    for (const allocation of allocations) {
      if (
        !allocation.warehouseId ||
        !Number.isFinite(allocation.qty) ||
        (allocation.qty ?? 0) <= 0
      ) {
        continue;
      }
      const perWarehouse = grouped.get(allocation.warehouseId) ?? new Map();
      const key = requirement.sku ?? "unknown";
      const current = perWarehouse.get(key);
      perWarehouse.set(key, {
        sku: key,
        itemName: requirement.itemName ?? key,
        unit: requirement.unit ?? "",
        quantity: (current?.quantity ?? 0) + (allocation.qty ?? 0),
      });
      grouped.set(allocation.warehouseId, perWarehouse);
    }
  }
  return new Map(
    [...grouped].map(([warehouseId, items]) => [warehouseId, [...items.values()] as const]),
  );
}

/** Gom số đã tính thành context text cho LLM (LLM chỉ đọc, không đổi số). */
function buildActionPlanContext(
  incident: IncidentInput,
  fulfillment: number,
  allocations: AllocationSummary[],
  warehouses: WarehouseEta[],
  severity: { level: number; reasons: string[] },
  forecasts: { label: string; probability: number }[],
): string {
  const vulnerable = countVulnerablePeople(incident);
  const allocLines = allocations.map(
    (a) =>
      `- ${a.itemName}: cần ${a.required} ${a.unit}, cấp ${a.allocated}, thiếu ${a.shortage}` +
      (a.fromWarehouses.length ? ` (từ ${a.fromWarehouses.join(", ")})` : ""),
  );
  const whLines = warehouses.map((w) =>
    w.routeStatus === "ROUTED"
      ? `- ${w.name}: ${w.distanceKm}km, ~${w.etaMinutes} phút`
      : `- ${w.name}: chưa tính được tuyến (${w.routeStatus})`,
  );
  const fcLines = forecasts.map((f) => `- ${f.label}: ${f.probability}%`);

  return [
    `TÌNH HUỐNG: ${incident.incidentType}, ${incident.affectedPeople} người, dự kiến ${incident.durationHours}h.`,
    // "khoảng" chứ không phải "tổng": ba ô chồng nhau nên con số này là ước lượng
    // đã cắt ở tổng số người, không phải phép cộng — xem `countVulnerablePeople`.
    `Nhóm dễ tổn thương: ${incident.children} trẻ em, ${incident.elderly} người già, ${incident.medicalSupportCases} ca y tế (khoảng ${vulnerable} người, các nhóm có thể chồng nhau).`,
    `MỨC KHẨN CẤP: ${severity.level}/5. Lý do: ${severity.reasons.join(" ")}`,
    `MỨC ĐÁP ỨNG KHO: ${fulfillment}%.`,
    "PHƯƠNG ÁN CẤP PHÁT:",
    ...allocLines,
    whLines.length ? "ĐIỀU PHỐI KHO (khoảng cách/ETA tới điểm nạn):" : "",
    ...whLines,
    "DỰ BÁO (đã tính sẵn, KHÔNG đổi):",
    ...fcLines,
  ]
    .filter(Boolean)
    .join("\n");
}

/** "Nhiệm vụ số 145" — tên người trực gọi nhau; bản ghi cũ chưa có số thì lùi về tên chung. */
function missionLabel(missionNo?: number | null): string {
  return missionNo != null ? `Nhiệm vụ số ${missionNo}` : "Nhiệm vụ";
}
