import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import {
  DeliveryOutcome,
  MissionStatus,
  MissionWarehouseRequestStatus,
  NotificationKind,
  Prisma,
  ReportProcessingState,
  UserRole as PrismaUserRole,
} from "@prisma/client";
import {
  IncidentType,
  Permission,
  roleHasPermission,
  UserRole,
} from "@safestock/shared-types";
import { randomUUID } from "crypto";
import { AiClientService } from "../ai/ai-client.service";
import { GeoService } from "../geo/geo.service";
import { LatLng } from "../geo/haversine";
import { InventoryService } from "../inventory/inventory.service";
import { NotificationService } from "../notification/notification.service";
import { PrismaService } from "../prisma/prisma.service";
import { ReadinessService } from "../readiness/readiness.service";
import {
  ActionPlan,
  ActionPlanNarrative,
  AllocationSummary,
  buildTemplateNarrative,
  computeForecasts,
  scoreSeverity,
  WarehouseEta,
} from "./action-plan";
import { assessBatchEligibility } from "./batch-eligibility";
import {
  allocateGreedy,
  AvailableBatch,
  computeRequirements,
  IncidentInput,
} from "./mission.compute";
import { assessMissionReadiness, MissionReadinessAssessment } from "./mission-readiness";
import { assertTransition } from "./mission.workflow";
import { validateAndDecodeWav } from "./wav";

const REPORT_NOT_FOUND = "Không tìm thấy báo cáo";
const MISSION_NOT_FOUND = "Không tìm thấy nhiệm vụ";
const ANALYSIS_LEASE_MINUTES = 10;

/** Gợi ý mượn kho lân cận cho 1 SKU thiếu. */
interface NeighborSuggestion {
  name: string;
  distanceKm: number;
  available: number;
}

interface CurrentActor {
  userId: string;
  organizationId: string;
  role: UserRole;
  warehouseId: string | null;
}

export interface ReporterAudioMetadata {
  present: boolean;
  mimeType?: string;
  sizeBytes?: number;
  durationSeconds?: number | null;
}

export interface ReporterWarehouseLogisticsEstimate {
  label: "WAREHOUSE_LOGISTICS";
  warehouseName: string;
  distanceKm: number;
  etaMinutes: number;
  source: "google" | "haversine";
  calculatedAt: string;
}

export interface ReporterReportSummary {
  id: string;
  reportText: string;
  incidentType: string;
  location: string | null;
  affectedPeople: number;
  durationHours: number;
  priority: string;
  severityLevel: number | null;
  incidentLat: number | null;
  incidentLng: number | null;
  status: MissionStatus;
  processingState: ReportProcessingState;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  audio: ReporterAudioMetadata;
  warehouseLogisticsEstimates: ReporterWarehouseLogisticsEstimate[];
}

export interface ReporterReportDetail extends ReporterReportSummary {
  fulfillment: number;
  approvedAt: string | null;
  rejectionReason: string | null;
  adminNote: string | null;
  deliveryOutcome: DeliveryOutcome | null;
  deliveryNote: string | null;
  requirements: {
    sku: string;
    itemName: string;
    required: number;
    allocated: number;
    shortage: number;
    unit: string;
    allocations?: Prisma.JsonValue;
  }[];
  sourceHamlet: { warehouseId: string; name: string };
  warehouseRequests: WarehouseRequestProjection[];
}

export interface OperatorReportDetail extends ReporterReportDetail {
  actionPlan: ActionPlan | null;
  readinessAssessment: (MissionReadinessAssessment & {
    warehouseOperationalStatus: string | null;
  }) | null;
}

export interface ReporterReportPage {
  items: ReporterReportSummary[];
  nextCursor: string | null;
}

interface ReporterProjectionRow {
  id: string;
  reportText: string | null;
  status: MissionStatus;
  reportProcessingState: ReportProcessingState | null;
  incidentType: string;
  location: string | null;
  affectedPeople: number;
  durationHours: number;
  priority: string;
  incidentLat: number | null;
  incidentLng: number | null;
  fulfillment: number;
  rejectionReason: string | null;
  adminNote: string | null;
  deliveryOutcome: DeliveryOutcome | null;
  deliveryNote: string | null;
  createdAt: Date;
  updatedAt: Date;
  approvedAt: Date | null;
  completedAt: Date | null;
  parsedInput: Prisma.JsonValue;
  actionPlan: Prisma.JsonValue | null;
  readinessAssessment?: Prisma.JsonValue | null;
  warehouse: { id: string; name: string };
  warehouseRequests: WarehouseRequestProjection[];
  audio: {
    mimeType: string;
    sizeBytes: number;
    durationSeconds: number | null;
  } | null;
  requirements: {
    sku: string;
    itemName: string;
    required: number;
    allocated: number;
    shortage: number;
    unit: string;
    allocations?: Prisma.JsonValue;
  }[];
}

interface WarehouseRequestProjection {
  id: string;
  warehouseId: string;
  warehouse: { name: string };
  sku: string;
  itemName: string;
  unit: string;
  requestedQuantity: number;
  preparedQuantity: number;
  status: MissionWarehouseRequestStatus;
  warehouseNote: string | null;
  adminNote: string | null;
  acceptedAt: Date | null;
  preparedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface AnalysisPayload {
  incident: IncidentInput;
  fulfillment: number;
  readinessAssessment: MissionReadinessAssessment & {
    warehouseOperationalStatus: string | null;
  };
  requirements: {
    sku: string;
    itemName: string;
    required: number;
    allocated: number;
    shortage: number;
    unit: string;
    allocations: Prisma.InputJsonValue;
    neighborSuggestion: Prisma.InputJsonValue | typeof Prisma.JsonNull;
  }[];
}

const warehouseRequestProjectionSelect = {
  id: true,
  missionId: true,
  warehouseId: true,
  sku: true,
  itemName: true,
  unit: true,
  requestedQuantity: true,
  preparedQuantity: true,
  status: true,
  warehouseNote: true,
  adminNote: true,
  acceptedAt: true,
  preparedAt: true,
  createdAt: true,
  updatedAt: true,
  warehouse: { select: { name: true } },
  mission: {
    select: {
      id: true,
      status: true,
      incidentType: true,
      location: true,
      reportText: true,
      warehouse: { select: { name: true } },
    },
  },
} satisfies Prisma.MissionWarehouseRequestSelect;

interface ReviewedWarehouseRequestInput {
  warehouseId: string;
  sku: string;
  quantity: number;
}

@Injectable()
export class MissionService {
  private readonly log = new Logger(MissionService.name);

  constructor(
    private prisma: PrismaService,
    private geo: GeoService,
    private ai: AiClientService,
    private notifications: NotificationService,
    private inventory: InventoryService,
    private readiness: ReadinessService,
  ) {}

  async assertActorPermission(userId: string, permission: Permission): Promise<void> {
    await this.requireActor(userId, permission);
  }

  async transcribeReportAudio(
    userId: string,
    audioBase64: string,
    mimeType: string,
  ): Promise<{ text: string }> {
    await this.requireActor(userId, Permission.INCIDENT_REPORT_TRANSCRIBE);
    validateAndDecodeWav(audioBase64, mimeType);
    return this.ai.transcribe(audioBase64, mimeType);
  }

  /**
   * Lập phương án generic. Kho phải thuộc tổ chức hiện tại của actor; WAREHOUSE
   * actor còn bị giới hạn ở kho đang được phân công.
   */
  async generatePlan(
    warehouseId: string,
    incident: IncidentInput,
    actorUserId: string,
    incidentPoint?: LatLng,
  ) {
    const actor = await this.requireActor(actorUserId, Permission.MISSION_CREATE);
    const warehouse = await this.requireWarehouseInActorScope(actor, warehouseId);
    const analysis = await this.computeAnalysis(warehouse, incident, incidentPoint);

    return this.prisma.mission.create({
      data: {
        warehouseId,
        incidentType: incident.incidentType,
        affectedPeople: incident.affectedPeople,
        durationHours: incident.durationHours,
        priority: "MEDIUM",
        parsedInput: incident as unknown as Prisma.InputJsonValue,
        status: MissionStatus.DRAFT,
        fulfillment: analysis.fulfillment,
        readinessAssessment: analysis.readinessAssessment as unknown as Prisma.InputJsonValue,
        incidentLat: incidentPoint?.lat,
        incidentLng: incidentPoint?.lng,
        createdByUserId: actor.userId,
        requirements: { create: analysis.requirements },
      },
      include: {
        requirements: true,
        warehouse: { select: { id: true, name: true } },
        warehouseRequests: {
          select: warehouseRequestProjectionSelect,
          orderBy: [{ warehouseId: "asc" }, { sku: "asc" }],
        },
      },
    });
  }

  /** Validate first, then persist Mission and optional private WAV in one transaction. */
  async submitReport(
    actorUserId: string,
    input: {
      description: string;
      location?: string;
      warehouseId?: string;
      incidentLat?: number;
      incidentLng?: number;
      audioBase64?: string;
      mimeType?: string;
    },
  ): Promise<{ missionId: string }> {
    const hasLatitude = input.incidentLat != null;
    const hasLongitude = input.incidentLng != null;
    if (hasLatitude !== hasLongitude) {
      throw new BadRequestException("Toạ độ phải gồm đủ vĩ độ và kinh độ");
    }
    const hasAudio = input.audioBase64 != null;
    const hasMimeType = input.mimeType != null;
    if (hasAudio !== hasMimeType) {
      throw new BadRequestException("Audio phải gồm đủ dữ liệu base64 và mimeType");
    }
    const audio =
      input.audioBase64 != null && input.mimeType != null
        ? validateAndDecodeWav(input.audioBase64, input.mimeType)
        : null;

    const report = await this.prisma.$transaction(async (tx) => {
      const actor = await this.requireActorInClient(
        tx,
        actorUserId,
        Permission.INCIDENT_REPORT_SUBMIT,
      );
      if (actor.role !== UserRole.REPORTER || !actor.warehouseId) {
        throw new ForbiddenException("Tài khoản không được gửi báo cáo hiện trường");
      }
      if (input.warehouseId != null && input.warehouseId !== actor.warehouseId) {
        throw new ForbiddenException("Bạn chỉ được gửi báo cáo tới kho đang được phân công");
      }
      const warehouse = await this.requireWarehouseInActorScopeInClient(
        tx,
        actor,
        actor.warehouseId,
      );
      const created = await tx.mission.create({
        data: {
          warehouseId: warehouse.id,
          incidentType: IncidentType.OTHER,
          affectedPeople: 0,
          durationHours: 24,
          priority: "MEDIUM",
          parsedInput: defaultReportPlaceholder() as unknown as Prisma.InputJsonValue,
          reportText: input.description,
          location: normalizeOptionalText(input.location, 300),
          status: MissionStatus.DRAFT,
          reportProcessingState: ReportProcessingState.SUBMITTED,
          incidentLat: input.incidentLat ?? null,
          incidentLng: input.incidentLng ?? null,
          createdByUserId: actor.userId,
        },
        select: { id: true },
      });
      if (audio) {
        await tx.missionAudio.create({
          data: {
            missionId: created.id,
            bytes: audio.bytes,
            mimeType: "audio/wav",
            sizeBytes: audio.byteLength,
            durationSeconds: audio.durationMs / 1000,
          },
        });
      }
      return {
        missionId: created.id,
        warehouseId: warehouse.id,
        warehouseName: warehouse.name,
        organizationId: actor.organizationId,
      };
    });

    const excerpt =
      input.description.length > 140
        ? `${input.description.slice(0, 140)}…`
        : input.description;
    const notification = {
      recipientRole: PrismaUserRole.ADMIN,
      kind: NotificationKind.INCIDENT_REPORTED,
      title: "Báo cáo mới từ trưởng thôn",
      body: `${report.warehouseName}${input.location?.trim() ? ` — ${input.location.trim()}` : ""}: ${excerpt}`,
      missionId: report.missionId,
      warehouseId: report.warehouseId,
      organizationId: report.organizationId,
    };
    await this.notifications.create(notification).catch((error: unknown) => {
      this.log.warn(`Tạo thông báo báo cáo ${report.missionId} lỗi sau commit: ${errorMessage(error)}`);
    });
    return { missionId: report.missionId };
  }

  /** ADMIN review gate: replace per-warehouse request rows and publish one plan. */
  async approveReport(
    id: string,
    actorUserId: string,
    input: { location?: string; adminNote?: string; requests: ReviewedWarehouseRequestInput[] },
  ) {
    const actor = await this.requireActor(actorUserId, Permission.MISSION_APPROVE);
    if (actor.role !== UserRole.ADMIN) throw new NotFoundException(REPORT_NOT_FOUND);
    const mission = await this.requireMissionInActorScope(id, actor);
    this.assertReportAnalyzed(mission.reportProcessingState);
    if (mission.status !== MissionStatus.DRAFT) throw new BadRequestException("Báo cáo không còn chờ duyệt");
    const requests = normalizeReviewedRequests(input.requests);
    if (requests.length === 0) throw new BadRequestException("Cần ít nhất một yêu cầu kho");

    const result = await this.prisma.$transaction(async (tx) => {
      const currentActor = await this.requireActorInClient(tx, actorUserId, Permission.MISSION_APPROVE);
      if (currentActor.role !== UserRole.ADMIN || currentActor.organizationId !== actor.organizationId) {
        throw new NotFoundException(REPORT_NOT_FOUND);
      }
      const warehouses = await tx.warehouse.findMany({
        where: { organizationId: currentActor.organizationId, id: { in: requests.map((request) => request.warehouseId) } },
        select: { id: true, name: true },
      });
      if (warehouses.length !== new Set(requests.map((request) => request.warehouseId)).size) {
        throw new NotFoundException(REPORT_NOT_FOUND);
      }
      const requirements = await tx.missionRequirement.findMany({
        where: { missionId: id },
        select: { sku: true, itemName: true, unit: true, allocations: true },
      });
      const materialized = materializeReviewedRequests(requests, requirements);
      const claimed = await tx.mission.updateMany({
        where: { id, warehouseId: mission.warehouseId, warehouse: { organizationId: currentActor.organizationId }, status: MissionStatus.DRAFT, reportProcessingState: ReportProcessingState.ANALYZED },
        data: { status: MissionStatus.APPROVED, approvedByUserId: currentActor.userId, approvedAt: new Date(), location: normalizeOptionalText(input.location, 300) ?? mission.location, adminNote: normalizeOptionalText(input.adminNote, 1000) },
      });
      if (claimed.count !== 1) throw new BadRequestException("Báo cáo vừa được cập nhật, vui lòng tải lại");
      await tx.missionWarehouseRequest.deleteMany({ where: { missionId: id } });
      await tx.missionWarehouseRequest.createMany({
        data: materialized.map((request) => ({
          missionId: id,
          warehouseId: request.warehouseId,
          sku: request.sku,
          itemName: request.itemName,
          unit: request.unit,
          requestedQuantity: request.quantity,
          allocations: request.allocations as unknown as Prisma.InputJsonValue,
          status: MissionWarehouseRequestStatus.PENDING,
        })),
      });
      const movedToWarehouse = await tx.mission.updateMany({
        where: {
          id,
          warehouseId: mission.warehouseId,
          warehouse: { organizationId: currentActor.organizationId },
          status: MissionStatus.APPROVED,
          reportProcessingState: ReportProcessingState.ANALYZED,
        },
        data: { status: MissionStatus.PENDING_WAREHOUSE },
      });
      if (movedToWarehouse.count !== 1) {
        throw new BadRequestException("Báo cáo vừa được cập nhật, vui lòng tải lại");
      }
      const sourceWarehouse = await tx.warehouse.findFirstOrThrow({
        where: { id: mission.warehouseId, organizationId: currentActor.organizationId },
        select: { id: true, name: true },
      });
      return {
        sourceWarehouse,
        location: normalizeOptionalText(input.location, 300) ?? mission.location,
        materialized,
        warehouses,
      };
    });
    const warehouseNotifications = await Promise.allSettled(
      result.warehouses.map((warehouse) => {
        const lines = result.materialized
          .filter((request) => request.warehouseId === warehouse.id)
          .map((request) => `${request.itemName}: ${request.quantity} ${request.unit}`)
          .join(", ");
        return this.notifications.create({
          recipientRole: PrismaUserRole.WAREHOUSE,
          kind: NotificationKind.WAREHOUSE_REQUESTED,
          title: "Yêu cầu chuẩn bị vật tư",
          body: `Báo cáo ${id}: ${lines || "kiểm tra yêu cầu"}. Thôn báo cáo: ${result.sourceWarehouse.name}${result.location ? ` — ${result.location}` : ""}.`,
          missionId: id,
          warehouseId: warehouse.id,
          organizationId: actor.organizationId,
        });
      }),
    );
    for (const delivery of warehouseNotifications) {
      if (delivery.status === "rejected") {
        this.log.warn(`Tạo thông báo kho của báo cáo ${id} lỗi: ${errorMessage(delivery.reason)}`);
      }
    }
    await this.notifications.create({
      recipientRole: PrismaUserRole.RESCUE,
      kind: NotificationKind.MISSION_ASSIGNED,
      title: "Phương án cứu hộ đã được duyệt",
      body: `Thôn báo cáo: ${result.sourceWarehouse.name}${result.location ? ` — ${result.location}` : ""}. ` +
        `Điểm lấy: ${result.materialized.map((request) => `${request.itemName} ${request.quantity} ${request.unit} tại ${result.warehouses.find((warehouse) => warehouse.id === request.warehouseId)?.name ?? request.warehouseId}`).join("; ")}`,
      missionId: id,
      organizationId: actor.organizationId,
    }).catch((error: unknown) => this.log.warn(`Tạo thông báo rescue ${id} lỗi: ${errorMessage(error)}`));
    return this.getOperatorReport(actorUserId, id);
  }

  async acceptWarehouseRequest(requestId: string, actorUserId: string, note?: string) {
    const actor = await this.requireActor(actorUserId, Permission.MISSION_WAREHOUSE_REQUEST_ACCEPT);
    if (actor.role !== UserRole.WAREHOUSE || !actor.warehouseId) throw new NotFoundException(MISSION_NOT_FOUND);
    const actorWarehouseId = actor.warehouseId;
    const updated = await this.prisma.$transaction(async (tx) => {
      const currentActor = await this.requireActorInClient(tx, actorUserId, Permission.MISSION_WAREHOUSE_REQUEST_ACCEPT);
      if (currentActor.role !== UserRole.WAREHOUSE || currentActor.warehouseId !== actorWarehouseId || currentActor.organizationId !== actor.organizationId) throw new NotFoundException(MISSION_NOT_FOUND);
      return tx.missionWarehouseRequest.updateMany({
        where: { id: requestId, warehouseId: actorWarehouseId, warehouse: { organizationId: currentActor.organizationId }, mission: { warehouse: { organizationId: currentActor.organizationId } }, status: MissionWarehouseRequestStatus.PENDING },
        data: { status: MissionWarehouseRequestStatus.ACCEPTED, acceptedByUserId: currentActor.userId, acceptedAt: new Date(), warehouseNote: normalizeOptionalText(note, 1000) },
      });
    });
    if (updated.count !== 1) {
      const current = await this.prisma.missionWarehouseRequest.findFirst({
        where: { id: requestId, warehouseId: actorWarehouseId, mission: { warehouse: { organizationId: actor.organizationId } } },
      });
      if (current?.status === MissionWarehouseRequestStatus.ACCEPTED || current?.status === MissionWarehouseRequestStatus.PREPARED) {
        return current;
      }
      throw new NotFoundException(MISSION_NOT_FOUND);
    }
    const request = await this.prisma.missionWarehouseRequest.findFirstOrThrow({ where: { id: requestId, warehouseId: actorWarehouseId, mission: { warehouse: { organizationId: actor.organizationId } } } });
    await this.notifications.create({ recipientRole: PrismaUserRole.ADMIN, kind: NotificationKind.WAREHOUSE_REQUEST_ACCEPTED, title: "Kho đã tiếp nhận yêu cầu", body: `Kho đã tiếp nhận ${request.sku}.`, missionId: request.missionId, warehouseId: actorWarehouseId, organizationId: actor.organizationId }).catch((error: unknown) => this.log.warn(`Tạo thông báo accept ${requestId} lỗi: ${errorMessage(error)}`));
    return request;
  }

  async prepareWarehouseRequest(requestId: string, actorUserId: string, note?: string) {
    const actor = await this.requireActor(actorUserId, Permission.MISSION_FULFILL);
    if (actor.role !== UserRole.WAREHOUSE || !actor.warehouseId) throw new NotFoundException(MISSION_NOT_FOUND);
    const request = await this.prisma.missionWarehouseRequest.findFirst({ where: { id: requestId, warehouseId: actor.warehouseId, warehouse: { organizationId: actor.organizationId }, mission: { warehouse: { organizationId: actor.organizationId } } } });
    if (!request) throw new NotFoundException(MISSION_NOT_FOUND);
    if (request.status === MissionWarehouseRequestStatus.PREPARED) return request;
    if (request.status !== MissionWarehouseRequestStatus.ACCEPTED) throw new BadRequestException("Kho phải tiếp nhận yêu cầu trước");
    const items = requestBatches(request.allocations);
    if (items.length === 0) throw new BadRequestException("Yêu cầu kho không có lô vật tư hợp lệ");
    const preparationToken = randomUUID();
    const result = await this.prisma.$transaction(async (tx) => {
      const currentActor = await this.requireActorInClient(tx, actorUserId, Permission.MISSION_FULFILL);
      if (currentActor.role !== UserRole.WAREHOUSE || currentActor.warehouseId !== request.warehouseId || currentActor.organizationId !== actor.organizationId) throw new NotFoundException(MISSION_NOT_FOUND);
      const claimed = await tx.missionWarehouseRequest.updateMany({
        where: {
          id: requestId,
          warehouseId: currentActor.warehouseId,
          warehouse: { organizationId: currentActor.organizationId },
          mission: { warehouse: { organizationId: currentActor.organizationId } },
          status: MissionWarehouseRequestStatus.ACCEPTED,
          preparationClaimToken: null,
        },
        data: { preparationClaimToken: preparationToken, preparationClaimedAt: new Date() },
      });
      if (claimed.count !== 1) throw new BadRequestException("Yêu cầu vừa được cập nhật, vui lòng tải lại");
      const updated = await tx.missionWarehouseRequest.updateMany({
        where: {
          id: requestId,
          warehouseId: currentActor.warehouseId,
          preparationClaimToken: preparationToken,
          status: MissionWarehouseRequestStatus.ACCEPTED,
        },
        data: {
          status: MissionWarehouseRequestStatus.PREPARED,
          preparedQuantity: request.requestedQuantity,
          preparedAllocations: items as unknown as Prisma.InputJsonValue,
          preparedByUserId: currentActor.userId,
          preparedAt: new Date(),
          preparationClaimToken: null,
          preparationClaimedAt: null,
          warehouseNote: normalizeOptionalText(note, 1000),
        },
      });
      if (updated.count !== 1) throw new BadRequestException("Yêu cầu vừa được cập nhật, vui lòng tải lại");
      await this.inventory.bulkExportInTx(tx, currentActor.userId, items, `Yêu cầu kho ${requestId}`, currentActor.warehouseId);
      const pending = await tx.missionWarehouseRequest.count({ where: { missionId: request.missionId, status: { not: MissionWarehouseRequestStatus.PREPARED } } });
      const missionUpdate = pending === 0
        ? await tx.mission.updateMany({ where: { id: request.missionId, warehouse: { organizationId: currentActor.organizationId }, status: { in: [MissionStatus.APPROVED, MissionStatus.PENDING_WAREHOUSE] } }, data: { status: MissionStatus.READY } })
        : await tx.mission.updateMany({ where: { id: request.missionId, warehouse: { organizationId: currentActor.organizationId }, status: { in: [MissionStatus.APPROVED, MissionStatus.PENDING_WAREHOUSE] } }, data: { status: MissionStatus.PENDING_WAREHOUSE } });
      if (missionUpdate.count !== 1) throw new BadRequestException("Nhiệm vụ không còn ở trạng thái chuẩn bị kho");
      return tx.missionWarehouseRequest.findFirstOrThrow({ where: { id: requestId, warehouseId: currentActor.warehouseId } });
    });
    await this.inventory.recalcBatches(items.map((item) => item.batchId)).catch((error: unknown) => this.log.warn(`Recalc request ${requestId} lỗi: ${errorMessage(error)}`));
    await Promise.allSettled([
      this.notifications.create({ recipientRole: PrismaUserRole.ADMIN, kind: NotificationKind.WAREHOUSE_READY, title: "Kho đã chuẩn bị xong phần vật tư", body: `${result.itemName}: ${result.preparedQuantity} ${result.unit}.`, missionId: result.missionId, warehouseId: result.warehouseId, organizationId: actor.organizationId }),
      this.notifications.create({ recipientRole: PrismaUserRole.RESCUE, kind: NotificationKind.WAREHOUSE_READY, title: "Có kho đã chuẩn bị xong", body: `${result.itemName}: ${result.preparedQuantity} ${result.unit}.`, missionId: result.missionId, warehouseId: result.warehouseId, organizationId: actor.organizationId }),
    ]);
    return result;
  }

  /** Compatibility wrapper for internal callers; submission should use submitReport. */
  async createReportDraft(input: {
    warehouseId: string;
    description: string;
    location?: string;
    userId: string;
    incidentPoint?: LatLng;
    audioBase64?: string;
    mimeType?: string;
  }) {
    const result = await this.submitReport(input.userId, {
      warehouseId: input.warehouseId,
      description: input.description,
      location: input.location,
      incidentLat: input.incidentPoint?.lat,
      incidentLng: input.incidentPoint?.lng,
      audioBase64: input.audioBase64,
      mimeType: input.mimeType,
    });
    return { id: result.missionId };
  }

  async resolveReportWarehouseId(actorUserId: string, requestedId?: string): Promise<string> {
    const actor = await this.requireActor(actorUserId, Permission.INCIDENT_REPORT_SUBMIT);
    if (actor.role !== UserRole.REPORTER || !actor.warehouseId) {
      throw new ForbiddenException("Tài khoản chưa được phân công kho nhận báo cáo");
    }
    if (requestedId != null && requestedId !== actor.warehouseId) {
      throw new ForbiddenException("Bạn chỉ được gửi báo cáo tới kho đang được phân công");
    }
    await this.requireWarehouseInActorScope(actor, actor.warehouseId);
    return actor.warehouseId;
  }

  async listOwnReports(actorUserId: string, cursor?: string, limit = 20): Promise<ReporterReportPage> {
    const actor = await this.requireActor(actorUserId, Permission.INCIDENT_REPORT_VIEW_OWN);
    if (actor.role !== UserRole.REPORTER) throw new NotFoundException(REPORT_NOT_FOUND);
    const warehouseIds = await this.organizationWarehouseIds(actor.organizationId);
    const decodedCursor = cursor ? decodeReportCursor(cursor) : null;
    const rows = await this.prisma.mission.findMany({
      where: {
        createdByUserId: actor.userId,
        warehouseId: { in: warehouseIds },
        reportProcessingState: { not: null },
        ...(decodedCursor
          ? {
              OR: [
                { createdAt: { lt: decodedCursor.createdAt } },
                { createdAt: decodedCursor.createdAt, id: { lt: decodedCursor.id } },
              ],
            }
          : {}),
      },
      select: reportProjectionSelect,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: Math.min(50, Math.max(1, limit)) + 1,
    });
    const hasNextPage = rows.length > limit;
    const visible = rows.slice(0, limit);
    const last = visible.at(-1);
    return {
      items: visible.map((row) => projectReportSummary(row)),
      nextCursor: hasNextPage && last ? encodeReportCursor(last.createdAt, last.id) : null,
    };
  }

  async getOwnReport(actorUserId: string, id: string): Promise<ReporterReportDetail> {
    const actor = await this.requireActor(actorUserId, Permission.INCIDENT_REPORT_VIEW_OWN);
    if (actor.role !== UserRole.REPORTER) throw new NotFoundException(REPORT_NOT_FOUND);
    const warehouseIds = await this.organizationWarehouseIds(actor.organizationId);
    const row = await this.prisma.mission.findFirst({
      where: {
        id,
        createdByUserId: actor.userId,
        warehouseId: { in: warehouseIds },
        reportProcessingState: { not: null },
      },
      select: reportProjectionSelect,
    });
    if (!row) throw new NotFoundException(REPORT_NOT_FOUND);
    return projectReportDetail(row);
  }

  async getOperatorReport(actorUserId: string, id: string): Promise<OperatorReportDetail> {
    const actor = await this.requireActor(actorUserId, Permission.INCIDENT_REPORT_ANALYZE);
    if (actor.role !== UserRole.ADMIN) throw new NotFoundException(REPORT_NOT_FOUND);
    const warehouseIds = await this.actorWarehouseIds(actor);
    const row = await this.prisma.mission.findFirst({
      where: { id, warehouseId: { in: warehouseIds }, reportProcessingState: { not: null } },
      select: operatorReportProjectionSelect,
    });
    if (!row) throw new NotFoundException(REPORT_NOT_FOUND);
    return projectOperatorReportDetail(row);
  }

  async getReportAudio(
    actorUserId: string,
    id: string,
  ): Promise<{ bytes: Buffer; mimeType: "audio/wav"; sizeBytes: number }> {
    const actor = await this.requireActor(actorUserId, Permission.INCIDENT_REPORT_AUDIO_READ);
    if (actor.role !== UserRole.ADMIN) throw new NotFoundException(REPORT_NOT_FOUND);
    const warehouseIds = await this.actorWarehouseIds(actor);
    const report = await this.prisma.mission.findFirst({
      where: { id, warehouseId: { in: warehouseIds }, reportProcessingState: { not: null } },
      select: { id: true },
    });
    if (!report) throw new NotFoundException(REPORT_NOT_FOUND);
    const audio = await this.prisma.missionAudio.findUnique({
      where: { missionId: report.id },
      select: { bytes: true, sizeBytes: true, mimeType: true },
    });
    if (!audio || audio.mimeType !== "audio/wav") throw new NotFoundException(REPORT_NOT_FOUND);
    return { bytes: audio.bytes, mimeType: "audio/wav", sizeBytes: audio.sizeBytes };
  }

  async listWarehouseRequests(actorUserId: string) {
    const actor = await this.requireActor(actorUserId, Permission.MISSION_VIEW);
    if (actor.role !== UserRole.WAREHOUSE || !actor.warehouseId) throw new NotFoundException(MISSION_NOT_FOUND);
    return this.prisma.missionWarehouseRequest.findMany({
      where: {
        warehouseId: actor.warehouseId,
        warehouse: { organizationId: actor.organizationId },
        mission: { warehouse: { organizationId: actor.organizationId } },
      },
      select: warehouseRequestProjectionSelect,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 100,
    });
  }

  async reportWarehouseDiscrepancy(requestId: string, actorUserId: string, note: string) {
    const actor = await this.requireActor(actorUserId, Permission.MISSION_FULFILL);
    if (actor.role !== UserRole.WAREHOUSE || !actor.warehouseId) throw new NotFoundException(MISSION_NOT_FOUND);
    const normalizedNote = normalizeOptionalText(note, 1000);
    if (!normalizedNote) throw new BadRequestException("Cần ghi rõ thiếu hoặc sai thông tin");
    const request = await this.prisma.missionWarehouseRequest.findFirst({
      where: { id: requestId, warehouseId: actor.warehouseId, warehouse: { organizationId: actor.organizationId }, mission: { warehouse: { organizationId: actor.organizationId } } },
    });
    if (!request) throw new NotFoundException(MISSION_NOT_FOUND);
    const updated = await this.prisma.missionWarehouseRequest.update({
      where: { id: request.id },
      data: { warehouseNote: normalizedNote },
      select: warehouseRequestProjectionSelect,
    });
    await this.notifications.create({
      recipientRole: PrismaUserRole.ADMIN,
      kind: NotificationKind.WAREHOUSE_REQUEST_REVIEW,
      title: "Kho báo thiếu hoặc cần kiểm tra lại",
      body: `${updated.warehouse.name}: ${updated.itemName} — ${normalizedNote}`,
      missionId: updated.missionId,
      warehouseId: updated.warehouseId,
      organizationId: actor.organizationId,
    }).catch((error: unknown) => this.log.warn(`Tạo thông báo chênh lệch ${requestId} lỗi: ${errorMessage(error)}`));
    return updated;
  }

  async reviewWarehouseRequest(
    requestId: string,
    actorUserId: string,
    input: { requestedQuantity: number; adminNote?: string },
  ) {
    const actor = await this.requireActor(actorUserId, Permission.MISSION_APPROVE);
    if (actor.role !== UserRole.ADMIN) throw new NotFoundException(MISSION_NOT_FOUND);
    if (!Number.isInteger(input.requestedQuantity) || input.requestedQuantity < 1) {
      throw new BadRequestException("Số lượng yêu cầu không hợp lệ");
    }
    const result = await this.prisma.$transaction(async (tx) => {
      const currentActor = await this.requireActorInClient(tx, actorUserId, Permission.MISSION_APPROVE);
      if (currentActor.role !== UserRole.ADMIN || currentActor.organizationId !== actor.organizationId) {
        throw new NotFoundException(MISSION_NOT_FOUND);
      }
      const request = await tx.missionWarehouseRequest.findFirst({
        where: {
          id: requestId,
          warehouse: { organizationId: currentActor.organizationId },
          mission: { warehouse: { organizationId: currentActor.organizationId } },
        },
      });
      if (!request) throw new NotFoundException(MISSION_NOT_FOUND);
      if (request.status === MissionWarehouseRequestStatus.PREPARED) {
        throw new BadRequestException("Không thể chỉnh sửa yêu cầu đã chuẩn bị xong");
      }
      const allocations = requestBatches(request.allocations);
      const available = allocations.reduce((sum, item) => sum + item.quantity, 0);
      if (input.requestedQuantity > available) {
        throw new BadRequestException("Số lượng vượt quá phần vật tư đã được phân bổ");
      }
      let remaining = input.requestedQuantity;
      const resized = allocations.flatMap((item) => {
        const quantity = Math.min(item.quantity, remaining);
        remaining -= quantity;
        return quantity > 0 ? [{ batchId: item.batchId, qty: quantity }] : [];
      });
      return tx.missionWarehouseRequest.update({
        where: { id: request.id },
        data: {
          requestedQuantity: input.requestedQuantity,
          allocations: resized as unknown as Prisma.InputJsonValue,
          status: MissionWarehouseRequestStatus.PENDING,
          warehouseNote: null,
          adminNote: normalizeOptionalText(input.adminNote, 1000),
          acceptedByUserId: null,
          acceptedAt: null,
        },
        select: warehouseRequestProjectionSelect,
      });
    });
    await this.notifications.create({
      recipientRole: PrismaUserRole.WAREHOUSE,
      kind: NotificationKind.WAREHOUSE_REQUESTED,
      title: "Yêu cầu kho đã được cập nhật",
      body: `${result.itemName}: ${result.requestedQuantity} ${result.unit}. Vui lòng kiểm tra và tiếp nhận lại yêu cầu.`,
      missionId: result.missionId,
      warehouseId: result.warehouseId,
      organizationId: actor.organizationId,
    }).catch((error: unknown) => this.log.warn(`Tạo thông báo cập nhật yêu cầu ${requestId} lỗi: ${errorMessage(error)}`));
    return result;
  }

  async getWarehouseRequest(actorUserId: string, requestId: string) {
    const actor = await this.requireActor(actorUserId, Permission.MISSION_VIEW);
    if (actor.role !== UserRole.WAREHOUSE || !actor.warehouseId) throw new NotFoundException(MISSION_NOT_FOUND);
    const request = await this.prisma.missionWarehouseRequest.findFirst({
      where: { id: requestId, warehouseId: actor.warehouseId, warehouse: { organizationId: actor.organizationId }, mission: { warehouse: { organizationId: actor.organizationId } } },
      select: warehouseRequestProjectionSelect,
    });
    if (!request) throw new NotFoundException(MISSION_NOT_FOUND);
    return request;
  }

  /** Claim with database time, analyze outside transactions, finalize with token CAS. */
  async analyzeReport(actorUserId: string, id: string): Promise<ReporterReportDetail> {
    const token = randomUUID();
    const actor = await this.requireActor(actorUserId, Permission.INCIDENT_REPORT_ANALYZE);
    if (actor.role !== UserRole.ADMIN) throw new NotFoundException(REPORT_NOT_FOUND);

    const claimed = await this.prisma.$transaction(async (tx) => {
      const currentActor = await this.requireActorInClient(tx, actorUserId, Permission.INCIDENT_REPORT_ANALYZE);
      if (currentActor.role !== UserRole.ADMIN) throw new NotFoundException(REPORT_NOT_FOUND);
      const rows = await tx.$queryRaw<
        {
          id: string;
          warehouseId: string;
          reportText: string;
          location: string | null;
          incidentLat: number | null;
          incidentLng: number | null;
        }[]
      >(Prisma.sql`
        UPDATE "Mission" AS mission
        SET "reportProcessingState" = 'ANALYZING',
            "analysisClaimToken" = ${token},
            "analysisClaimedAt" = NOW(),
            "updatedAt" = NOW()
        FROM "Warehouse" AS warehouse
        WHERE mission."id" = ${id}
          AND mission."warehouseId" = warehouse."id"
          AND warehouse."organizationId" = ${currentActor.organizationId}
          AND mission."createdByUserId" IS NOT NULL
          AND mission."reportText" IS NOT NULL
          AND mission."status"::text = 'DRAFT'
          AND (
            mission."reportProcessingState"::text IN ('SUBMITTED', 'ANALYSIS_FAILED')
            OR (
              mission."reportProcessingState"::text = 'ANALYZING'
              AND mission."analysisClaimedAt" < NOW() - INTERVAL '${Prisma.raw(
                String(ANALYSIS_LEASE_MINUTES),
              )} minutes'
            )
          )
        RETURNING mission."id", mission."warehouseId", mission."reportText", mission."location",
                  mission."incidentLat", mission."incidentLng"
      `);
      return rows[0] ?? null;
    });

    if (!claimed) {
      const warehouseIds = await this.actorWarehouseIds(actor);
      const current = await this.prisma.mission.findFirst({
        where: { id, warehouseId: { in: warehouseIds }, reportProcessingState: { not: null } },
        select: { status: true, reportProcessingState: true },
      });
      if (!current) throw new NotFoundException(REPORT_NOT_FOUND);
      if (current.reportProcessingState === ReportProcessingState.ANALYZED) {
        throw new BadRequestException("Báo cáo đã được phân tích");
      }
      if (current.reportProcessingState === ReportProcessingState.ANALYZING) {
        throw new BadRequestException("Báo cáo đang được phân tích");
      }
      throw new BadRequestException("Báo cáo không còn ở trạng thái có thể phân tích");
    }

    try {
      const incident = await this.ai.parse(claimed.reportText);
      const warehouse = await this.prisma.warehouse.findFirst({
        where: { id: claimed.warehouseId, organizationId: actor.organizationId },
      });
      if (!warehouse) throw new NotFoundException(REPORT_NOT_FOUND);
      const incidentPoint =
        claimed.incidentLat != null && claimed.incidentLng != null
          ? { lat: claimed.incidentLat, lng: claimed.incidentLng }
          : undefined;
      const analysis = await this.computeAnalysis(warehouse, incident, incidentPoint);
      await this.finalizeAnalysisSuccess(
        id,
        token,
        analysis,
        actorUserId,
        actor.organizationId,
        claimed.location,
      );
      return this.getOperatorReport(actorUserId, id);
    } catch (error) {
      await this.finalizeAnalysisFailure(
        id,
        token,
        actorUserId,
        actor.organizationId,
      ).catch(
        (finalizeError: unknown) => {
          this.log.warn(`Không thể ghi nhận lỗi phân tích báo cáo ${id}: ${errorMessage(finalizeError)}`);
        },
      );
      throw error;
    }
  }

  async getMission(id: string, actorUserId: string) {
    const actor = await this.requireActor(actorUserId, Permission.MISSION_VIEW);
    const warehouseIds = await this.actorWarehouseIds(actor);
    const mission = await this.prisma.mission.findFirst({
      where: { id, warehouseId: { in: warehouseIds } },
      include: {
        requirements: true,
        warehouse: { select: { id: true, name: true } },
        warehouseRequests: {
          select: warehouseRequestProjectionSelect,
          orderBy: [{ warehouseId: "asc" }, { sku: "asc" }],
        },
      },
    });
    if (!mission) throw new NotFoundException(MISSION_NOT_FOUND);
    if (actor.role === UserRole.RESCUE && mission.reportProcessingState == null) {
      throw new NotFoundException(MISSION_NOT_FOUND);
    }
    return mission;
  }

  /** Duyệt phương án — chuyển DRAFT → APPROVED. */
  async approve(id: string, actorUserId: string) {
    const actor = await this.requireActor(actorUserId, Permission.MISSION_APPROVE);
    const mission = await this.requireMissionInActorScope(id, actor);
    this.assertReportAnalyzed(mission.reportProcessingState);
    if (mission.status !== MissionStatus.DRAFT) {
      throw new BadRequestException("Chỉ duyệt được nhiệm vụ ở trạng thái nháp");
    }
    this.assertMissionDispatchable(mission.readinessAssessment);
    const approved = await this.prisma.mission.updateMany({
      where: {
        id,
        warehouseId: mission.warehouseId,
        warehouse: { organizationId: actor.organizationId },
        status: MissionStatus.DRAFT,
        ...(mission.reportProcessingState != null
          ? { reportProcessingState: ReportProcessingState.ANALYZED }
          : {}),
      },
      data: {
        status: MissionStatus.APPROVED,
        approvedByUserId: actor.userId,
        approvedAt: new Date(),
      },
    });
    if (approved.count === 0) {
      throw new BadRequestException("Chỉ duyệt được nhiệm vụ ở trạng thái nháp");
    }
    return this.prisma.mission.findFirstOrThrow({ where: { id, warehouseId: mission.warehouseId } });
  }

  async setExplanation(id: string, explanation: string, actorUserId: string) {
    const actor = await this.requireActor(actorUserId, Permission.MISSION_VIEW);
    const mission = await this.requireMissionInActorScope(id, actor);
    this.assertReportAnalyzed(mission.reportProcessingState);
    const updated = await this.prisma.$transaction(async (tx) => {
      const currentActor = await this.requireActorInClient(tx, actorUserId, Permission.MISSION_VIEW);
      if (currentActor.organizationId !== actor.organizationId) throw new NotFoundException(MISSION_NOT_FOUND);
      return tx.mission.updateMany({
        where: {
          id,
          warehouseId: mission.warehouseId,
          warehouse: { organizationId: currentActor.organizationId },
          status: mission.status,
          updatedAt: mission.updatedAt,
          ...(mission.reportProcessingState != null
            ? { reportProcessingState: ReportProcessingState.ANALYZED }
            : {}),
        },
        data: { explanation },
      });
    });
    if (updated.count === 0) throw new BadRequestException("Nhiệm vụ vừa được cập nhật, vui lòng tải lại");
    return this.prisma.mission.findFirstOrThrow({ where: { id, warehouseId: mission.warehouseId } });
  }

  async dispatch(id: string, actorUserId: string) {
    const actor = await this.requireActor(actorUserId, Permission.MISSION_CREATE);
    const mission = await this.requireMissionInActorScope(id, actor);
    this.assertReportAnalyzed(mission.reportProcessingState);
    this.guardTransition(mission.status, MissionStatus.PENDING_RESCUE);
    this.assertMissionDispatchable(mission.readinessAssessment);
    const updated = await this.updateMissionIfCurrent(
      mission,
      { status: MissionStatus.PENDING_RESCUE },
      MissionStatus.PENDING_RESCUE,
      actor,
    );
    await this.notifications.create({
      recipientRole: PrismaUserRole.RESCUE,
      kind: NotificationKind.MISSION_ASSIGNED,
      title: "Nhiệm vụ cứu hộ mới",
      body: `${mission.incidentType} — ${mission.affectedPeople} người. Xác nhận để lấy vật tư.`,
      missionId: id,
      organizationId: actor.organizationId,
    });
    return updated;
  }

  async deferByAdmin(id: string, note: string | undefined, actorUserId: string) {
    const actor = await this.requireActor(actorUserId, Permission.MISSION_CREATE);
    const mission = await this.requireMissionInActorScope(id, actor);
    this.assertReportAnalyzed(mission.reportProcessingState);
    this.guardTransition(mission.status, MissionStatus.DEFERRED);
    const updated = await this.updateMissionIfCurrent(
      mission,
      { status: MissionStatus.DEFERRED, adminNote: note ?? null },
      MissionStatus.DEFERRED,
      actor,
    );
    await this.notifications.create({
      recipientRole: PrismaUserRole.RESCUE,
      kind: NotificationKind.MISSION_DEFERRED,
      title: "Đơn từ chối đã được tiếp nhận",
      body: `${mission.incidentType} — ${mission.affectedPeople} người. Đang được xem xét, sẽ cập nhật lại.${note ? ` Ghi chú: ${note}` : ""}`,
      missionId: id,
      organizationId: actor.organizationId,
    });
    return updated;
  }

  async resendByAdmin(id: string, note: string | undefined, actorUserId: string) {
    const actor = await this.requireActor(actorUserId, Permission.MISSION_CREATE);
    const mission = await this.requireMissionInActorScope(id, actor);
    this.assertReportAnalyzed(mission.reportProcessingState);
    this.guardTransition(mission.status, MissionStatus.PENDING_RESCUE);
    const updated = await this.updateMissionIfCurrent(
      mission,
      { status: MissionStatus.PENDING_RESCUE, adminNote: note ?? mission.adminNote },
      MissionStatus.PENDING_RESCUE,
      actor,
    );
    await this.notifications.create({
      recipientRole: PrismaUserRole.RESCUE,
      kind: NotificationKind.MISSION_ASSIGNED,
      title: "Nhiệm vụ đã cập nhật — mời xác nhận lại",
      body: `${mission.incidentType} — ${mission.affectedPeople} người.${note ? ` Phản hồi: ${note}` : ""}`,
      missionId: id,
      organizationId: actor.organizationId,
    });
    return updated;
  }

  /** ADMIN may cancel an intake before analysis; all other transitions require analyzed data. */
  async cancelByAdmin(id: string, note: string | undefined, actorUserId: string) {
    const actor = await this.requireActor(actorUserId, Permission.MISSION_CREATE);
    const mission = await this.requireMissionInActorScope(id, actor);
    if (mission.reportProcessingState != null) {
      const preparedRequests = await this.prisma.missionWarehouseRequest.count({
        where: { missionId: id, status: MissionWarehouseRequestStatus.PREPARED },
      });
      if (preparedRequests > 0) {
        throw new BadRequestException("Không thể huỷ sau khi có kho đã xuất vật tư");
      }
    }
    this.guardTransition(mission.status, MissionStatus.CANCELLED);
    const warehouseWasWaiting =
      mission.status === MissionStatus.RESCUE_CONFIRMED ||
      mission.status === MissionStatus.PENDING_WAREHOUSE;
    const updated = await this.updateMissionIfCurrent(
      mission,
      { status: MissionStatus.CANCELLED, adminNote: note ?? null },
      MissionStatus.CANCELLED,
      actor,
    );
    await this.notifications.create({
      recipientRole: PrismaUserRole.RESCUE,
      kind: NotificationKind.MISSION_CANCELLED,
      title: "Nhiệm vụ đã huỷ",
      body: `${mission.incidentType} — ${mission.affectedPeople} người. Nhiệm vụ đã huỷ.${note ? ` Lý do: ${note}` : ""}`,
      missionId: id,
      organizationId: actor.organizationId,
    });
    if (warehouseWasWaiting) {
      await this.notifications.create({
        recipientRole: PrismaUserRole.WAREHOUSE,
        kind: NotificationKind.MISSION_CANCELLED,
        title: "Nhiệm vụ đã huỷ — dừng chuẩn bị",
        body: `${mission.incidentType} — ${mission.affectedPeople} người. Điều phối đã huỷ, không cần xuất kho.${note ? ` Lý do: ${note}` : ""}`,
        missionId: id,
        organizationId: actor.organizationId,
      });
    }
    return updated;
  }

  async listMissions(actorUserId: string, statuses?: MissionStatus[]) {
    const actor = await this.requireActor(actorUserId, Permission.MISSION_VIEW);
    const warehouseIds = await this.actorWarehouseIds(actor);
    return this.prisma.mission.findMany({
      where: {
        warehouseId: { in: warehouseIds },
        ...(actor.role === UserRole.RESCUE ? { reportProcessingState: { not: null } } : {}),
        ...(statuses && statuses.length > 0 ? { status: { in: statuses } } : {}),
      },
      orderBy: { createdAt: "desc" },
      include: {
        requirements: true,
        warehouse: { select: { id: true, name: true } },
        warehouseRequests: { select: warehouseRequestProjectionSelect },
      },
      take: 100,
    });
  }

  async prepareByWarehouse(id: string, actorUserId: string, _jwtWarehouseId?: string | null) {
    const result = await this.prisma.$transaction(async (tx) => {
      const actor = await this.requireActorInClient(tx, actorUserId, Permission.MISSION_FULFILL);
      const mission = await tx.mission.findFirst({
        where: {
          id,
          warehouseId: {
            in: await this.actorWarehouseIdsInClient(tx, actor),
          },
        },
        include: { requirements: true },
      });
      if (!mission) throw new NotFoundException(MISSION_NOT_FOUND);
      this.assertReportAnalyzed(mission.reportProcessingState);
      if (mission.status === MissionStatus.READY) {
        const current = await tx.mission.findFirstOrThrow({ where: { id, warehouseId: mission.warehouseId } });
        return { mission: current, prepared: false, batchIds: [] as string[] };
      }
      this.guardTransition(mission.status, MissionStatus.READY);
      const claim = await tx.mission.updateMany({
        where: {
          id,
          status: MissionStatus.PENDING_WAREHOUSE,
          warehouseId: mission.warehouseId,
          warehouse: { organizationId: actor.organizationId },
          ...(mission.reportProcessingState != null
            ? { reportProcessingState: ReportProcessingState.ANALYZED }
            : {}),
        },
        data: { status: MissionStatus.READY },
      });
      if (claim.count === 0) {
        const current = await tx.mission.findFirst({ where: { id, warehouseId: mission.warehouseId } });
        if (current?.status === MissionStatus.READY) {
          return { mission: current, prepared: false, batchIds: [] as string[] };
        }
        throw new BadRequestException("Nhiệm vụ đang được chuẩn bị, vui lòng thử lại");
      }
      const items = collectMissionBatches(mission.requirements);
      if (items.length > 0) {
        await this.inventory.bulkExportInTx(
          tx,
          actorUserId,
          items,
          `Nhiệm vụ ${id}`,
          actor.warehouseId,
        );
      }
      const updated = await tx.mission.findFirstOrThrow({ where: { id, warehouseId: mission.warehouseId } });
      return {
        mission: updated,
        prepared: true,
        batchIds: items.map((item) => item.batchId),
        organizationId: actor.organizationId,
      };
    });

    if (!result.prepared) return result.mission;
    await this.inventory.recalcBatches(result.batchIds).catch((error: unknown) => {
      this.log.warn(`Recalc readiness sau prepare ${id} lỗi: ${errorMessage(error)}`);
    });
    const notifications = await Promise.allSettled(
      [PrismaUserRole.ADMIN, PrismaUserRole.RESCUE].map((role) =>
        this.notifications.create({
          recipientRole: role,
          kind: NotificationKind.WAREHOUSE_READY,
          title: "Kho đã chuẩn bị xong",
          body: `Vật tư cho ${result.mission.incidentType} đã sẵn sàng giao cho đội cứu hộ.`,
          missionId: id,
          organizationId: result.organizationId,
        }),
      ),
    );
    for (const notification of notifications) {
      if (notification.status === "rejected") {
        this.log.warn(`Tạo thông báo sau prepare ${id} lỗi: ${errorMessage(notification.reason)}`);
      }
    }
    return result.mission;
  }

  async generateActionPlan(id: string, actorUserId: string): Promise<ActionPlan> {
    const actor = await this.requireActor(actorUserId, Permission.MISSION_VIEW);
    const warehouseIds = await this.actorWarehouseIds(actor);
    const mission = await this.prisma.mission.findFirst({
      where: { id, warehouseId: { in: warehouseIds } },
      include: { requirements: true },
    });
    if (!mission) throw new NotFoundException(MISSION_NOT_FOUND);
    this.assertReportAnalyzed(mission.reportProcessingState);
    const incident = mission.parsedInput as unknown as IncidentInput;
    const allocations: AllocationSummary[] = mission.requirements.map((requirement) => ({
      sku: requirement.sku,
      itemName: requirement.itemName,
      unit: requirement.unit,
      required: requirement.required,
      allocated: requirement.allocated,
      shortage: requirement.shortage,
      fromWarehouses: warehouseNamesOf(requirement.allocations),
    }));
    const warehouses = await this.warehouseEtas(mission);
    const severity = scoreSeverity(incident, mission.fulfillment);
    const forecasts = computeForecasts(incident, mission.fulfillment);

    let narrative: ActionPlanNarrative;
    let generatedBy: ActionPlan["generatedBy"] = "ai";
    try {
      narrative = await this.ai.actionPlanNarrative(
        buildActionPlanContext(
          incident,
          mission.fulfillment,
          allocations,
          warehouses,
          severity,
          forecasts,
        ),
      );
    } catch (error) {
      this.log.warn(`AI action plan ${id} lỗi, dùng template: ${errorMessage(error)}`);
      narrative = buildTemplateNarrative(incident, allocations);
      generatedBy = "template";
    }
    const plan: ActionPlan = {
      severityLevel: severity.level,
      severityReason: severity.reasons,
      confidence: mission.fulfillment >= 70 ? 85 : 70,
      fulfillment: mission.fulfillment,
      allocations,
      warehouses,
      forecasts,
      narrative,
      generatedBy,
    };
    const saved = await this.prisma.mission.updateMany({
      where: {
        id,
        warehouseId: mission.warehouseId,
        warehouse: { organizationId: actor.organizationId },
        status: mission.status,
        updatedAt: mission.updatedAt,
        ...(mission.reportProcessingState != null
          ? { reportProcessingState: ReportProcessingState.ANALYZED }
          : {}),
      },
      data: { actionPlan: plan as unknown as Prisma.InputJsonValue },
    });
    if (saved.count === 0) throw new BadRequestException("Nhiệm vụ vừa được cập nhật, vui lòng tải lại");
    return plan;
  }

  async listClusterWarehouses(warehouseId: string, actorUserId: string) {
    const actor = await this.requireActor(actorUserId, Permission.MISSION_VIEW);
    const warehouse = await this.requireWarehouseInActorScope(actor, warehouseId);
    const cluster = await this.prisma.warehouse.findMany({
      where: { communeId: warehouse.communeId, organizationId: actor.organizationId },
    });
    return cluster
      .filter((item) => item.lat != null && item.lng != null)
      .map((item) => ({
        id: item.id,
        name: item.name,
        kind: item.kind,
        lat: item.lat as number,
        lng: item.lng as number,
      }));
  }

  private async finalizeAnalysisSuccess(
    id: string,
    token: string,
    analysis: AnalysisPayload,
    actorUserId: string,
    organizationId: string,
    explicitLocation?: string | null,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const currentActor = await this.requireActorInClient(
        tx,
        actorUserId,
        Permission.INCIDENT_REPORT_ANALYZE,
      );
      if (currentActor.role !== UserRole.ADMIN || currentActor.organizationId !== organizationId) {
        throw new NotFoundException(REPORT_NOT_FOUND);
      }
      const warehouseIds = await this.organizationWarehouseIdsInClient(
        tx,
        currentActor.organizationId,
      );
      const claimed = await tx.mission.updateMany({
        where: {
          id,
          warehouseId: { in: warehouseIds },
          status: MissionStatus.DRAFT,
          reportProcessingState: ReportProcessingState.ANALYZING,
          analysisClaimToken: token,
        },
        data: {
          incidentType: analysis.incident.incidentType,
          location: explicitLocation ?? analysis.incident.location ?? null,
          affectedPeople: analysis.incident.affectedPeople,
          durationHours: analysis.incident.durationHours,
          priority: analysis.incident.priority ?? "MEDIUM",
          parsedInput: analysis.incident as unknown as Prisma.InputJsonValue,
          fulfillment: analysis.fulfillment,
          readinessAssessment: analysis.readinessAssessment as unknown as Prisma.InputJsonValue,
          actionPlan: Prisma.JsonNull,
          explanation: null,
          reportProcessingState: ReportProcessingState.ANALYZED,
          analysisClaimToken: null,
          analysisClaimedAt: null,
        },
      });
      if (claimed.count === 0) {
        throw new BadRequestException("Quyền phân tích đã hết hạn hoặc báo cáo đã được xử lý");
      }
      await tx.missionRequirement.deleteMany({ where: { missionId: id } });
      if (analysis.requirements.length > 0) {
        await tx.missionRequirement.createMany({
          data: analysis.requirements.map((requirement) => ({ missionId: id, ...requirement })),
        });
      }
    });
  }

  private async finalizeAnalysisFailure(
    id: string,
    token: string,
    actorUserId: string,
    organizationId: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const currentActor = await this.requireActorInClient(
        tx,
        actorUserId,
        Permission.INCIDENT_REPORT_ANALYZE,
      );
      if (currentActor.role !== UserRole.ADMIN || currentActor.organizationId !== organizationId) {
        throw new NotFoundException(REPORT_NOT_FOUND);
      }
      await tx.mission.updateMany({
        where: {
          id,
          warehouse: { organizationId: currentActor.organizationId },
          status: MissionStatus.DRAFT,
          reportProcessingState: ReportProcessingState.ANALYZING,
          analysisClaimToken: token,
        },
        data: {
          reportProcessingState: ReportProcessingState.ANALYSIS_FAILED,
          analysisClaimToken: null,
          analysisClaimedAt: null,
        },
      });
    });
  }

  private async computeAnalysis(
    warehouse: {
      id: string;
      communeId: string;
      organizationId: string;
    },
    incident: IncidentInput,
    incidentPoint?: LatLng,
  ): Promise<AnalysisPayload> {
    const warehouseReadiness = await this.readiness.getWarehouseScore(warehouse.id);
    if (warehouseReadiness?.operationalStatus === "NOT_DISPATCHABLE") {
      const reason = warehouseReadiness.blockers[0]?.title ?? "Kho có blocker vận hành";
      throw new BadRequestException(
        `Kho chưa thể lập phương án mới: ${reason}. Cần xử lý nguyên nhân trước.`,
      );
    }
    const requirements = computeRequirements(incident);
    const batchPool = await this.loadClusterBatches(
      warehouse.communeId,
      warehouse.organizationId,
      requirements.map((requirement) => requirement.sku),
      incidentPoint,
    );
    const neighbors = await this.prisma.neighborWarehouse.findMany({
      where: { warehouseId: warehouse.id },
    });
    const allocations = requirements.map((requirement) =>
      allocateGreedy(requirement, batchPool.available),
    );
    const readinessAssessment = assessMissionReadiness(
      allocations,
      batchPool.unavailableReasonsBySku,
    );
    return {
      incident,
      fulfillment: readinessAssessment.fulfillment,
      readinessAssessment: {
        ...readinessAssessment,
        warehouseOperationalStatus: warehouseReadiness?.operationalStatus ?? null,
      },
      requirements: allocations.map((allocation) => ({
        sku: allocation.sku,
        itemName: allocation.itemName,
        required: allocation.required,
        allocated: allocation.allocated,
        shortage: allocation.shortage,
        unit: allocation.unit,
        allocations: allocation.batches as unknown as Prisma.InputJsonValue,
        neighborSuggestion:
          allocation.shortage > 0
            ? (this.suggestNeighbors(
                allocation.sku,
                allocation.shortage,
                neighbors,
              ) as unknown as Prisma.InputJsonValue)
            : Prisma.JsonNull,
      })),
    };
  }

  private async updateMissionIfCurrent(
    mission: {
      id: string;
      warehouseId: string;
      status: MissionStatus;
      reportProcessingState: ReportProcessingState | null;
    },
    data: Prisma.MissionUpdateManyMutationInput,
    transitionTarget: MissionStatus,
    actor: CurrentActor,
  ) {
    const updated = await this.prisma.$transaction(async (tx) => {
      const currentActor = await this.requireActorInClient(tx, actor.userId, requiredTransitionPermission(actor.role));
      if (currentActor.organizationId !== actor.organizationId || currentActor.role !== actor.role) {
        throw new NotFoundException(MISSION_NOT_FOUND);
      }
      const actorWarehouseIds = await this.actorWarehouseIdsInClient(tx, currentActor);
      if (!actorWarehouseIds.includes(mission.warehouseId)) throw new NotFoundException(MISSION_NOT_FOUND);
      return tx.mission.updateMany({
        where: {
          id: mission.id,
          warehouseId: mission.warehouseId,
          warehouse: { organizationId: currentActor.organizationId },
          status: mission.status,
          ...(mission.reportProcessingState != null
            ? { reportProcessingState: ReportProcessingState.ANALYZED }
            : {}),
        },
        data,
      });
    });
    if (updated.count === 0) {
      const current = await this.requireMissionInActorScope(mission.id, actor);
      this.guardTransition(current.status, transitionTarget);
      throw new BadRequestException("Nhiệm vụ vừa được cập nhật, vui lòng tải lại");
    }
    return this.prisma.mission.findFirstOrThrow({
      where: { id: mission.id, warehouseId: mission.warehouseId },
    });
  }

  private async requireMissionInActorScope(id: string, actor: CurrentActor) {
    const warehouseIds = await this.actorWarehouseIds(actor);
    const mission = await this.prisma.mission.findFirst({
      where: { id, warehouseId: { in: warehouseIds } },
    });
    if (!mission) throw new NotFoundException(MISSION_NOT_FOUND);
    return mission;
  }

  private async requireActor(userId: string, permission: Permission): Promise<CurrentActor> {
    return this.requireActorInClient(this.prisma, userId, permission);
  }

  private async requireActorInClient(
    client: Pick<Prisma.TransactionClient, "user" | "warehouse">,
    userId: string,
    permission: Permission,
  ): Promise<CurrentActor> {
    const user = await client.user.findUnique({
      where: { id: userId },
      select: { id: true, organizationId: true, role: true, warehouseId: true },
    });
    if (!user) throw new UnauthorizedException("Tài khoản không còn tồn tại");
    const role = user.role as UserRole;
    if (!roleHasPermission(role, permission)) {
      throw new ForbiddenException("Không đủ quyền thực hiện thao tác này");
    }
    if (role === UserRole.WAREHOUSE || role === UserRole.REPORTER) {
      if (!user.warehouseId) {
        throw new UnauthorizedException("Phạm vi kho của tài khoản không hợp lệ");
      }
      const warehouse = await client.warehouse.findFirst({
        where: { id: user.warehouseId, organizationId: user.organizationId },
        select: { id: true },
      });
      if (!warehouse) {
        throw new UnauthorizedException("Phạm vi kho của tài khoản không hợp lệ");
      }
    }
    return {
      userId: user.id,
      organizationId: user.organizationId,
      role,
      warehouseId: user.warehouseId,
    };
  }

  private async requireWarehouseInActorScope(actor: CurrentActor, warehouseId: string) {
    return this.requireWarehouseInActorScopeInClient(this.prisma, actor, warehouseId);
  }

  private async requireWarehouseInActorScopeInClient(
    client: Pick<Prisma.TransactionClient, "warehouse">,
    actor: CurrentActor,
    warehouseId: string,
  ) {
    const warehouse = await client.warehouse.findFirst({
      where: { id: warehouseId, organizationId: actor.organizationId },
    });
    if (!warehouse || (actor.warehouseId != null && actor.warehouseId !== warehouse.id)) {
      throw new NotFoundException("Không tìm thấy kho");
    }
    return warehouse;
  }

  private actorWarehouseIds(actor: CurrentActor): Promise<string[]> {
    return this.actorWarehouseIdsInClient(this.prisma, actor);
  }

  private async actorWarehouseIdsInClient(
    client: Pick<Prisma.TransactionClient, "warehouse">,
    actor: CurrentActor,
  ): Promise<string[]> {
    if (
      (actor.role === UserRole.WAREHOUSE || actor.role === UserRole.REPORTER) &&
      actor.warehouseId == null
    ) {
      throw new UnauthorizedException("Phạm vi kho của tài khoản không hợp lệ");
    }
    const warehouses = await client.warehouse.findMany({
      where: {
        organizationId: actor.organizationId,
        ...((actor.role === UserRole.WAREHOUSE || actor.role === UserRole.REPORTER) &&
        actor.warehouseId != null
          ? { id: actor.warehouseId }
          : {}),
      },
      select: { id: true },
    });
    if (
      (actor.role === UserRole.WAREHOUSE || actor.role === UserRole.REPORTER) &&
      warehouses.length !== 1
    ) {
      throw new UnauthorizedException("Phạm vi kho của tài khoản không hợp lệ");
    }
    return warehouses.map((warehouse) => warehouse.id);
  }

  private organizationWarehouseIds(organizationId: string): Promise<string[]> {
    return this.organizationWarehouseIdsInClient(this.prisma, organizationId);
  }

  private async organizationWarehouseIdsInClient(
    client: Pick<Prisma.TransactionClient, "warehouse">,
    organizationId: string,
  ): Promise<string[]> {
    const warehouses = await client.warehouse.findMany({
      where: { organizationId },
      select: { id: true },
    });
    return warehouses.map((warehouse) => warehouse.id);
  }

  private assertReportAnalyzed(state: ReportProcessingState | null): void {
    if (state == null || state === ReportProcessingState.ANALYZED) return;
    throw new BadRequestException("Báo cáo phải được phân tích trước khi xử lý nhiệm vụ");
  }

  private guardTransition(from: MissionStatus, to: MissionStatus): void {
    try {
      assertTransition(from, to);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
  }

  private assertMissionDispatchable(value: Prisma.JsonValue | null): void {
    const assessment = value as unknown as MissionReadinessAssessment | null;
    if (assessment?.status !== "NOT_DISPATCHABLE") return;
    const blocker = assessment.blockers[0];
    const reason = blocker
      ? `${blocker.itemName}: ${blocker.reasons[0] ?? "không có lô đủ điều kiện"}`
      : "Không đủ vật tư thiết yếu đủ điều kiện";
    throw new BadRequestException(`Chưa thể điều phối nhiệm vụ: ${reason}.`);
  }

  private async warehouseEtas(mission: {
    warehouseId: string;
    incidentLat: number | null;
    incidentLng: number | null;
    requirements: { allocations: Prisma.JsonValue }[];
  }): Promise<WarehouseEta[]> {
    const names = new Set<string>();
    for (const requirement of mission.requirements) {
      for (const name of warehouseNamesOf(requirement.allocations)) names.add(name);
    }
    if (mission.incidentLat == null || mission.incidentLng == null || names.size === 0) return [];
    const warehouse = await this.prisma.warehouse.findUnique({ where: { id: mission.warehouseId } });
    if (!warehouse) return [];
    const cluster = await this.prisma.warehouse.findMany({
      where: {
        communeId: warehouse.communeId,
        organizationId: warehouse.organizationId,
        name: { in: [...names] },
      },
    });
    const geolocated = cluster.filter((item) => item.lat != null && item.lng != null);
    if (geolocated.length === 0) return [];
    const origins = geolocated.map((item) => ({ lat: item.lat as number, lng: item.lng as number }));
    const results = await this.geo.distanceAndEta(origins, {
      lat: mission.incidentLat,
      lng: mission.incidentLng,
    });
    const calculatedAt = new Date().toISOString();
    return geolocated.map((item, index) => ({
      name: item.name,
      distanceKm: results[index].km,
      etaMinutes: results[index].etaMinutes,
      lat: item.lat as number,
      lng: item.lng as number,
      source: results[index].source,
      calculatedAt,
    }));
  }

  private async loadClusterBatches(
    communeId: string,
    organizationId: string,
    requiredSkus: string[],
    incidentPoint?: LatLng,
  ): Promise<{ available: AvailableBatch[]; unavailableReasonsBySku: Map<string, string[]> }> {
    const warehouses = await this.prisma.warehouse.findMany({
      where: { communeId, organizationId },
    });
    const readinessByWarehouse = new Map(
      await Promise.all(
        warehouses.map(
          async (warehouse) =>
            [warehouse.id, await this.readiness.getWarehouseScore(warehouse.id)] as const,
        ),
      ),
    );
    const distanceByWarehouse = await this.distancesToIncident(warehouses, incidentPoint);
    const batches = await this.prisma.itemBatch.findMany({
      where: {
        shelf: { zone: { warehouseId: { in: warehouses.map((warehouse) => warehouse.id) } } },
        item: { sku: { in: requiredSkus } },
      },
      include: {
        item: true,
        shelf: { include: { zone: true } },
        loans: { where: { status: { in: ["ON_LOAN", "PARTIALLY_RETURNED"] } } },
      },
    });
    const nameById = new Map(warehouses.map((warehouse) => [warehouse.id, warehouse.name]));
    const available: AvailableBatch[] = [];
    const unavailableReasonsBySku = new Map<string, string[]>();
    const now = new Date();
    for (const batch of batches) {
      const warehouseId = batch.shelf?.zone.warehouseId;
      const sourceReadiness = warehouseId ? readinessByWarehouse.get(warehouseId) : null;
      if (sourceReadiness?.operationalStatus === "NOT_DISPATCHABLE") {
        const reason = sourceReadiness.blockers[0]?.title ?? "Kho nguồn chưa thể điều phối";
        addUnavailableReason(unavailableReasonsBySku, batch.item.sku, `${batch.batchCode}: ${reason}`);
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
          addUnavailableReason(unavailableReasonsBySku, batch.item.sku, `${batch.batchCode}: ${reason}`);
        }
        continue;
      }
      available.push({
        batchId: batch.id,
        sku: batch.item.sku,
        quantity: eligibility.availableQuantity,
        expiryDate: batch.expiryDate,
        warehouseId,
        warehouseName: warehouseId ? nameById.get(warehouseId) : undefined,
        distanceKm: warehouseId ? (distanceByWarehouse.get(warehouseId) ?? 0) : 0,
      });
    }
    return { available, unavailableReasonsBySku };
  }

  private async distancesToIncident(
    warehouses: { id: string; lat: number | null; lng: number | null; distanceKm: number }[],
    incidentPoint?: LatLng,
  ): Promise<Map<string, number>> {
    const result = new Map<string, number>();
    if (!incidentPoint) {
      for (const warehouse of warehouses) result.set(warehouse.id, warehouse.distanceKm);
      return result;
    }
    const geolocated = warehouses.filter((warehouse) => warehouse.lat != null && warehouse.lng != null);
    const origins = geolocated.map((warehouse) => ({
      lat: warehouse.lat as number,
      lng: warehouse.lng as number,
    }));
    const distances = await this.geo.distanceAndEta(origins, incidentPoint);
    geolocated.forEach((warehouse, index) => result.set(warehouse.id, distances[index].km));
    for (const warehouse of warehouses) {
      if (!result.has(warehouse.id)) result.set(warehouse.id, warehouse.distanceKm);
    }
    return result;
  }

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
    return suggestions.sort((left, right) => left.distanceKm - right.distanceKm);
  }
}

const reportProjectionSelect = {
  id: true,
  reportText: true,
  status: true,
  reportProcessingState: true,
  incidentType: true,
  location: true,
  affectedPeople: true,
  durationHours: true,
  priority: true,
  incidentLat: true,
  incidentLng: true,
  fulfillment: true,
  rejectionReason: true,
  adminNote: true,
  deliveryOutcome: true,
  deliveryNote: true,
  createdAt: true,
  updatedAt: true,
  approvedAt: true,
  completedAt: true,
  parsedInput: true,
  actionPlan: true,
  audio: {
    select: { mimeType: true, sizeBytes: true, durationSeconds: true },
  },
  requirements: {
    select: {
      sku: true,
      itemName: true,
      required: true,
      allocated: true,
      shortage: true,
      unit: true,
      allocations: true,
    },
    orderBy: [{ sku: "asc" }, { id: "asc" }],
  },
  warehouse: { select: { id: true, name: true } },
  warehouseRequests: {
    select: warehouseRequestProjectionSelect,
    orderBy: [{ warehouseId: "asc" as const }, { sku: "asc" as const }],
  },
} satisfies Prisma.MissionSelect;

const operatorReportProjectionSelect = {
  ...reportProjectionSelect,
  readinessAssessment: true,
} satisfies Prisma.MissionSelect;

function defaultReportPlaceholder(): IncidentInput {
  return {
    incidentType: IncidentType.OTHER,
    affectedPeople: 0,
    durationHours: 24,
    children: 0,
    elderly: 0,
    medicalSupportCases: 0,
  };
}

function projectReportSummary(row: ReporterProjectionRow): ReporterReportSummary {
  if (row.reportProcessingState == null) throw new NotFoundException(REPORT_NOT_FOUND);
  const incident = row.parsedInput as unknown as IncidentInput;
  return {
    id: row.id,
    reportText: row.reportText ?? "",
    incidentType: row.incidentType,
    location: row.location,
    affectedPeople: row.affectedPeople,
    durationHours: row.durationHours,
    priority: row.priority,
    severityLevel:
      row.reportProcessingState === ReportProcessingState.ANALYZED
        ? scoreSeverity(incident, row.fulfillment).level
        : null,
    incidentLat: row.incidentLat,
    incidentLng: row.incidentLng,
    status: row.status,
    processingState: row.reportProcessingState,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
    audio: row.audio
      ? {
          present: true,
          mimeType: row.audio.mimeType,
          sizeBytes: row.audio.sizeBytes,
          durationSeconds: row.audio.durationSeconds,
        }
      : { present: false },
    warehouseLogisticsEstimates: reporterLogisticsEstimates(row.actionPlan),
  };
}

function projectReportDetail(row: ReporterProjectionRow): ReporterReportDetail {
  return {
    ...projectReportSummary(row),
    fulfillment: row.fulfillment,
    approvedAt: row.approvedAt?.toISOString() ?? null,
    rejectionReason: row.rejectionReason,
    adminNote: row.adminNote,
    deliveryOutcome: row.deliveryOutcome,
    deliveryNote: row.deliveryNote,
    requirements: row.requirements.map(({ allocations: _allocations, ...requirement }) => requirement),
    sourceHamlet: row.warehouse
      ? { warehouseId: row.warehouse.id, name: row.warehouse.name }
      : { warehouseId: "", name: "Chưa xác định" },
    warehouseRequests: row.warehouseRequests ?? [],
  };
}

function projectOperatorReportDetail(row: ReporterProjectionRow): OperatorReportDetail {
  return {
    ...projectReportDetail(row),
    requirements: row.requirements,
    actionPlan: row.actionPlan as unknown as ActionPlan | null,
    readinessAssessment:
      (row.readinessAssessment ?? null) as unknown as OperatorReportDetail["readinessAssessment"],
  };
}

function reporterLogisticsEstimates(
  actionPlan: Prisma.JsonValue | null,
): ReporterWarehouseLogisticsEstimate[] {
  if (!isJsonObject(actionPlan) || !Array.isArray(actionPlan.warehouses)) return [];
  const result: ReporterWarehouseLogisticsEstimate[] = [];
  for (const value of actionPlan.warehouses) {
    if (!isJsonObject(value)) continue;
    const source = value.source;
    const calculatedAt = value.calculatedAt;
    if (
      (source !== "google" && source !== "haversine") ||
      typeof calculatedAt !== "string" ||
      !isIsoDate(calculatedAt) ||
      typeof value.name !== "string" ||
      typeof value.distanceKm !== "number" ||
      typeof value.etaMinutes !== "number"
    ) {
      continue;
    }
    result.push({
      label: "WAREHOUSE_LOGISTICS",
      warehouseName: value.name,
      distanceKm: value.distanceKm,
      etaMinutes: value.etaMinutes,
      source,
      calculatedAt,
    });
  }
  return result;
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIsoDate(value: string): boolean {
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
}

function encodeReportCursor(createdAt: Date, id: string): string {
  return Buffer.from(JSON.stringify({ createdAt: createdAt.toISOString(), id }), "utf8").toString(
    "base64url",
  );
}

function decodeReportCursor(cursor: string): { createdAt: Date; id: string } {
  try {
    const decoded: unknown = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (!isJsonObject(decoded) || typeof decoded.createdAt !== "string" || typeof decoded.id !== "string") {
      throw new Error("invalid cursor fields");
    }
    const createdAt = new Date(decoded.createdAt);
    if (Number.isNaN(createdAt.getTime()) || !decoded.id) throw new Error("invalid cursor values");
    return { createdAt, id: decoded.id };
  } catch {
    throw new BadRequestException("Cursor báo cáo không hợp lệ");
  }
}

function collectMissionBatches(
  requirements: { allocations: Prisma.JsonValue }[],
): { batchId: string; quantity: number }[] {
  return requirements.flatMap((requirement) =>
    ((requirement.allocations as { batchId: string; qty: number }[]) ?? []).map((allocation) => ({
      batchId: allocation.batchId,
      quantity: allocation.qty,
    })),
  );
}

function addUnavailableReason(reasonsBySku: Map<string, string[]>, sku: string, reason: string): void {
  const reasons = reasonsBySku.get(sku) ?? [];
  if (!reasons.includes(reason)) reasons.push(reason);
  reasonsBySku.set(sku, reasons);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function normalizeOptionalText(value: string | null | undefined, maxLength: number): string | null {
  const normalized = value?.trim();
  if (!normalized) return null;
  if (normalized.length > maxLength) throw new BadRequestException(`Nội dung không được dài quá ${maxLength} ký tự`);
  return normalized;
}

function normalizeReviewedRequests(requests: ReviewedWarehouseRequestInput[]): ReviewedWarehouseRequestInput[] {
  const byKey = new Map<string, ReviewedWarehouseRequestInput>();
  for (const request of requests) {
    if (!request?.warehouseId || !request.sku || !Number.isInteger(request.quantity) || request.quantity <= 0) {
      throw new BadRequestException("Yêu cầu kho không hợp lệ");
    }
    const key = `${request.warehouseId}:${request.sku}`;
    if (byKey.has(key)) throw new BadRequestException("Không được lặp yêu cầu cùng kho và vật tư");
    byKey.set(key, { warehouseId: request.warehouseId, sku: request.sku, quantity: request.quantity });
  }
  return [...byKey.values()];
}

function materializeReviewedRequests(
  requests: ReviewedWarehouseRequestInput[],
  requirements: { sku: string; itemName: string; unit: string; allocations: Prisma.JsonValue }[],
): (ReviewedWarehouseRequestInput & { itemName: string; unit: string; allocations: Prisma.JsonValue })[] {
  const bySku = new Map(requirements.map((requirement) => [requirement.sku, requirement]));
  return requests.map((request) => {
    const requirement = bySku.get(request.sku);
    if (!requirement) throw new BadRequestException("Vật tư không thuộc phương án đã phân tích");
    const allocationRows = Array.isArray(requirement.allocations) ? requirement.allocations : [];
    const warehouseRows = allocationRows.filter(
      (row): row is { warehouseId?: string; warehouseName?: string; batchId?: string; qty?: number } =>
        typeof row === "object" && row !== null && !Array.isArray(row),
    );
    const matching = warehouseRows.filter((row) => row.warehouseId === request.warehouseId);
    const authoritativeQuantity = matching.reduce((sum, row) => sum + (typeof row.qty === "number" ? row.qty : 0), 0);
    if (authoritativeQuantity < request.quantity) {
      throw new BadRequestException("Số lượng kho vượt quá phương án AI đã phân bổ");
    }
    let remaining = request.quantity;
    const selected = matching.flatMap((row) => {
      const available = typeof row.qty === "number" ? row.qty : 0;
      const qty = Math.min(available, remaining);
      remaining -= qty;
      return qty > 0 ? [{ ...row, qty }] : [];
    });
    return {
      ...request,
      itemName: requirement.itemName,
      unit: requirement.unit,
      allocations: selected,
    };
  });
}

function requestBatches(value: Prisma.JsonValue): { batchId: string; quantity: number }[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) return [];
    const batchId = (row as Record<string, unknown>).batchId;
    const qty = (row as Record<string, unknown>).qty;
    return typeof batchId === "string" && typeof qty === "number" && qty > 0
      ? [{ batchId, quantity: qty }]
      : [];
  });
}

function requiredTransitionPermission(role: UserRole): Permission {
  switch (role) {
    case UserRole.ADMIN:
      return Permission.MISSION_CREATE;
    case UserRole.WAREHOUSE:
      return Permission.MISSION_FULFILL;
    default:
      return Permission.MISSION_VIEW;
  }
}

function warehouseNamesOf(allocations: Prisma.JsonValue): string[] {
  const list = (allocations as { warehouseName?: string }[]) ?? [];
  const names = new Set<string>();
  for (const allocation of list) if (allocation.warehouseName) names.add(allocation.warehouseName);
  return [...names];
}

function buildActionPlanContext(
  incident: IncidentInput,
  fulfillment: number,
  allocations: AllocationSummary[],
  warehouses: WarehouseEta[],
  severity: { level: number; reasons: string[] },
  forecasts: { label: string; probability: number }[],
): string {
  const vulnerable = incident.children + incident.elderly + incident.medicalSupportCases;
  const allocationLines = allocations.map(
    (allocation) =>
      `- ${allocation.itemName}: cần ${allocation.required} ${allocation.unit}, cấp ${allocation.allocated}, thiếu ${allocation.shortage}` +
      (allocation.fromWarehouses.length
        ? ` (từ ${allocation.fromWarehouses.join(", ")})`
        : ""),
  );
  const warehouseLines = warehouses.map(
    (warehouse) => `- ${warehouse.name}: ${warehouse.distanceKm}km, ~${warehouse.etaMinutes} phút`,
  );
  const forecastLines = forecasts.map(
    (forecast) => `- ${forecast.label}: ${forecast.probability}%`,
  );
  return [
    `TÌNH HUỐNG: ${incident.incidentType}, ${incident.affectedPeople} người, dự kiến ${incident.durationHours}h.`,
    `Nhóm dễ tổn thương: ${incident.children} trẻ em, ${incident.elderly} người già, ${incident.medicalSupportCases} ca y tế (tổng ${vulnerable}).`,
    `MỨC KHẨN CẤP: ${severity.level}/5. Lý do: ${severity.reasons.join(" ")}`,
    `MỨC ĐÁP ỨNG KHO: ${fulfillment}%.`,
    "PHƯƠNG ÁN CẤP PHÁT:",
    ...allocationLines,
    warehouseLines.length ? "ĐIỀU PHỐI KHO (khoảng cách/ETA tới điểm nạn):" : "",
    ...warehouseLines,
    "DỰ BÁO (đã tính sẵn, KHÔNG đổi):",
    ...forecastLines,
  ]
    .filter(Boolean)
    .join("\n");
}
