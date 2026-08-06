import {
  BadRequestException,
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
  Prisma,
  UserRole,
} from "@prisma/client";
import { FIELD_FORCE_ROLE_LABEL, IncidentType } from "@safestock/shared-types";
import { AiClientService } from "../ai/ai-client.service";
import { LatLng } from "../geo/haversine";
import { LocalRoutingService } from "../geo/local-routing.service";
import { InventoryService } from "../inventory/inventory.service";
import { assertWarehouseInScope } from "../inventory/warehouse-scope";
import { NotificationService } from "../notification/notification.service";
import { PrismaService } from "../prisma/prisma.service";
import { ReadinessService } from "../readiness/readiness.service";
import { assessBatchEligibility } from "./batch-eligibility";
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
  IncidentInput,
} from "./mission.compute";
import { assessMissionReadiness, MissionReadinessAssessment } from "./mission-readiness";
import { normalizeHamletName } from "../admin/hamlet-normalization";
import { findHamletInReport } from "./hamlet-in-report";
import { buildWarehouseRequestCreates } from "./mission-warehouse-request";

/** Gợi ý mượn kho lân cận cho 1 SKU thiếu. */
interface NeighborSuggestion {
  name: string;
  distanceKm: number;
  available: number;
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
  private async computePlan(warehouseId: string, incident: IncidentInput, incidentPoint?: LatLng) {
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
    description: string;
    userId?: string;
    requestId?: string;
    incidentPoint?: LatLng;
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
    const excerpt =
      input.description.length > 140 ? `${input.description.slice(0, 140)}…` : input.description;

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
            reportText: input.description,
            status: MissionStatus.DRAFT,
            incidentLat: input.incidentPoint?.lat,
            incidentLng: input.incidentPoint?.lng,
            createdByUserId: input.userId,
            reportRequestId: input.requestId,
          },
        });
        const notification = await tx.notification.create({
          data: {
            recipientRole: UserRole.ADMIN,
            kind: NotificationKind.INCIDENT_REPORTED,
            title: "Báo cáo mới từ trưởng thôn",
            body: excerpt,
            missionId: mission.id,
            warehouseId: input.warehouseId,
            organizationId: warehouse.organizationId,
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
    return mission;
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
    // Legacy/manual flow may supply an explicit ADMIN-selected point without a name.
    // No random or geocoded fallback is ever generated here.
    if (!location?.trim()) {
      if (!explicitPoint) {
        throw new BadRequestException(
          "Cần xác nhận địa điểm ứng phó bằng thôn đã xác minh hoặc tọa độ trên bản đồ trước khi lập phương án.",
        );
      }
      return { point: explicitPoint };
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
    this.assertMissionDispatchable(mission.readinessAssessment, mission._count.requirements);
    const warehouseIds = missionParticipantWarehouseIds(mission.requirements, mission.warehouseId);
    const warehouseRequests = buildWarehouseRequestCreates(id, mission.requirements);
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
      const warehouseNotification = await tx.notification.create({
        data: {
          recipientRole: UserRole.WAREHOUSE,
          kind: NotificationKind.MISSION_ASSIGNED,
          title: "Phương án vật tư mới cần chuẩn bị",
          body: `${mission.incidentType} — ${mission.affectedPeople} người. Chuẩn bị phần vật tư được phân bổ cho kho.`,
          missionId: id,
          organizationId: mission.warehouse.organizationId,
        },
      });
      const fieldForceNotification = await tx.notification.create({
        data: {
          recipientRole: UserRole.RESCUE,
          kind: NotificationKind.MISSION_ASSIGNED,
          title: "Phương án ứng phó mới",
          body: `${mission.incidentType} — ${mission.affectedPeople} người. Xem tuyến và các điểm lấy vật tư trong phương án.`,
          missionId: id,
          organizationId: mission.warehouse.organizationId,
        },
      });
      const updated = await tx.mission.findUniqueOrThrow({
        where: { id },
        include: { requirements: true, warehousePreparations: true },
      });
      return { updated, notifications: [warehouseNotification, fieldForceNotification] };
    });
    for (const notification of result.notifications) {
      this.notifications.pushPersisted(notification);
    }
    return result.updated;
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
    await this.notifications.create({
      recipientRole: UserRole.WAREHOUSE,
      kind: NotificationKind.RESCUE_CONFIRMED,
      title: "Cứu hộ đã xác nhận — chuẩn bị vật tư",
      body: `${mission.incidentType} — ${mission.affectedPeople} người. Chuẩn bị và xuất kho theo phương án.`,
      missionId: id,
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
      await this.notifications.create({
        recipientRole: UserRole.WAREHOUSE,
        kind: NotificationKind.MISSION_REJECTED,
        title: `Tạm dừng chuẩn bị — ${FIELD_FORCE_ROLE_LABEL} đã rút`,
        body: `${mission.incidentType} — ${mission.affectedPeople} người. ${FIELD_FORCE_ROLE_LABEL} không tiếp tục được, chờ điều phối xử lý.`,
        missionId: id,
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
      body: `${mission.incidentType} — ${mission.affectedPeople} người.${note ? ` Phản hồi: ${note}` : ""}`,
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
  async cancelByAdmin(id: string, note?: string, scopeWarehouseId?: string | null) {
    const mission = await this.requireMission(id, scopeWarehouseId);
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
      await this.notifications.create({
        recipientRole: UserRole.WAREHOUSE,
        kind: NotificationKind.MISSION_CANCELLED,
        title: "Nhiệm vụ đã huỷ — dừng chuẩn bị",
        body: `${mission.incidentType} — ${mission.affectedPeople} người. Điều phối đã huỷ, không cần xuất kho.${note ? ` Lý do: ${note}` : ""}`,
        missionId: id,
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
  ) {
    const mission = await this.prisma.mission.findUnique({
      where: { id },
      include: { requirements: true },
    });
    if (!mission) throw new NotFoundException("Không tìm thấy nhiệm vụ");
    assertWarehouseInScope(scopeWarehouseId, mission.warehouseId);
    this.guardTransition(mission.status, MissionStatus.COMPLETED);

    const restockItems =
      outcome === DeliveryOutcome.FAILED ? collectMissionBatches(mission.requirements) : [];

    const updated = await this.prisma.$transaction(async (tx) => {
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
      if (restockItems.length > 0) {
        await this.inventory.bulkImportInTx(
          tx,
          userId,
          restockItems,
          `Hoàn kho: nhiệm vụ ${id} giao thất bại`,
        );
      }
      return tx.mission.findUniqueOrThrow({ where: { id } });
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
    for (const role of [UserRole.ADMIN, UserRole.WAREHOUSE]) {
      await this.notifications.create({
        recipientRole: role,
        kind: NotificationKind.MISSION_COMPLETED,
        title: `${FIELD_FORCE_ROLE_LABEL} đã giao — ${label}`,
        body: `${mission.incidentType} — ${mission.affectedPeople} người. Kết quả: ${label}.${note ? ` Ghi chú: ${note}` : ""}${stockNote}`,
        missionId: id,
      });
    }
    return updated;
  }

  /** Danh sách nhiệm vụ (lọc theo trạng thái nếu truyền) — mới nhất trước. */
  async listMissions(
    statuses?: MissionStatus[],
    actorUserId?: string,
    scopeWarehouseId?: string | null,
  ) {
    const actor = actorUserId
      ? await this.prisma.user.findUnique({
          where: { id: actorUserId },
          select: { organizationId: true },
        })
      : null;
    if (actorUserId && !actor) throw new NotFoundException("Không tìm thấy người dùng");
    return this.prisma.mission.findMany({
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
      orderBy: { createdAt: "desc" },
      include: {
        requirements: true,
        warehousePreparations: true,
        warehouseRequests: {
          include: { warehouse: { select: { id: true, name: true } } },
          orderBy: [{ warehouseId: "asc" }, { sku: "asc" }],
        },
      },
      take: 100,
    });
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
        tx.missionWarehouseRequest.count({
          where: { missionId: id, status: MissionWarehouseRequestStatus.PREPARED },
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
    throw new BadRequestException(`Chưa thể điều phối nhiệm vụ: ${reason}.`);
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
    const severity = scoreSeverity(incident, fulfillment);
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
      confidence: fulfillment >= 70 ? 85 : 70,
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
    return { available, unavailableReasonsBySku };
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
  const vulnerable = incident.children + incident.elderly + incident.medicalSupportCases;
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
    `Nhóm dễ tổn thương: ${incident.children} trẻ em, ${incident.elderly} người già, ${incident.medicalSupportCases} ca y tế (tổng ${vulnerable}).`,
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
