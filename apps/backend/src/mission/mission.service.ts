import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { DeliveryOutcome, MissionStatus, NotificationKind, Prisma, UserRole } from "@prisma/client";
import { IncidentType } from "@safestock/shared-types";
import { AiClientService } from "../ai/ai-client.service";
import { GeoService } from "../geo/geo.service";
import { LatLng } from "../geo/haversine";
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
import {
  assessMissionReadiness,
  MissionReadinessAssessment,
} from "./mission-readiness";

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
    private geo: GeoService,
    private ai: AiClientService,
    private notifications: NotificationService,
    private inventory: InventoryService,
    private readiness: ReadinessService,
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
    const fulfillment = readinessAssessment.fulfillment;

    const mission = await this.prisma.mission.create({
      data: {
        warehouseId,
        incidentType: incident.incidentType,
        affectedPeople: incident.affectedPeople,
        durationHours: incident.durationHours,
        priority: "MEDIUM",
        parsedInput: incident as unknown as Prisma.InputJsonValue,
        status: MissionStatus.DRAFT,
        fulfillment,
        readinessAssessment: {
          ...readinessAssessment,
          warehouseOperationalStatus: warehouseReadiness?.operationalStatus ?? null,
        } as unknown as Prisma.InputJsonValue,
        incidentLat: incidentPoint?.lat,
        incidentLng: incidentPoint?.lng,
        requirements: {
          create: allocations.map((alloc) => ({
            sku: alloc.sku,
            itemName: alloc.itemName,
            required: alloc.required,
            allocated: alloc.allocated,
            shortage: alloc.shortage,
            unit: alloc.unit,
            allocations: alloc.batches as unknown as Prisma.InputJsonValue,
            neighborSuggestion:
              alloc.shortage > 0
                ? (this.suggestNeighbors(alloc.sku, alloc.shortage, neighbors) as unknown as Prisma.InputJsonValue)
                : Prisma.JsonNull,
          })),
        },
      },
      include: { requirements: true },
    });
    return mission;
  }

  async getMission(id: string) {
    const mission = await this.prisma.mission.findUnique({
      where: { id },
      include: { requirements: true },
    });
    if (!mission) throw new NotFoundException("Không tìm thấy nhiệm vụ");
    return mission;
  }

  /** Duyệt phương án — chuyển DRAFT → APPROVED. */
  async approve(id: string, userId: string) {
    const mission = await this.prisma.mission.findUnique({ where: { id } });
    if (!mission) throw new NotFoundException("Không tìm thấy nhiệm vụ");
    if (mission.status !== MissionStatus.DRAFT) {
      throw new BadRequestException("Chỉ duyệt được nhiệm vụ ở trạng thái nháp");
    }
    this.assertMissionDispatchable(mission.readinessAssessment);
    const approved = await this.prisma.mission.updateMany({
      where: { id, status: MissionStatus.DRAFT },
      data: { status: MissionStatus.APPROVED, approvedByUserId: userId, approvedAt: new Date() },
    });
    if (approved.count === 0) {
      throw new BadRequestException("Chỉ duyệt được nhiệm vụ ở trạng thái nháp");
    }
    return this.prisma.mission.findUniqueOrThrow({ where: { id } });
  }

  /** Lưu giải thích AI (proxy từ ai-service) vào nhiệm vụ. */
  async setExplanation(id: string, explanation: string) {
    return this.prisma.mission.update({ where: { id }, data: { explanation } });
  }

  // ===== Workflow liên role (BE-L) =====

  /** ADMIN gửi phương án → chờ cứu hộ. DRAFT → PENDING_RESCUE, notify RESCUE. */
  async dispatch(id: string) {
    const mission = await this.requireMission(id);
    this.guardTransition(mission.status, MissionStatus.PENDING_RESCUE);
    this.assertMissionDispatchable(mission.readinessAssessment);
    const updated = await this.updateMissionIfCurrent(
      id,
      mission.status,
      { status: MissionStatus.PENDING_RESCUE },
      MissionStatus.PENDING_RESCUE,
    );
    await this.notifications.create({
      recipientRole: UserRole.RESCUE,
      kind: NotificationKind.MISSION_ASSIGNED,
      title: "Nhiệm vụ cứu hộ mới",
      body: `${mission.incidentType} — ${mission.affectedPeople} người. Xác nhận để lấy vật tư.`,
      missionId: id,
    });
    return updated;
  }

  /** RESCUE xác nhận lấy → chờ kho chuẩn bị. → PENDING_WAREHOUSE, notify WAREHOUSE. */
  async confirmByRescue(id: string) {
    const mission = await this.requireMission(id);
    this.guardTransition(mission.status, MissionStatus.RESCUE_CONFIRMED);
    const updated = await this.updateMissionIfCurrent(
      id,
      mission.status,
      { status: MissionStatus.PENDING_WAREHOUSE },
      MissionStatus.RESCUE_CONFIRMED,
    );
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
  async rejectByRescue(id: string, reason: string) {
    const mission = await this.requireMission(id);
    this.guardTransition(mission.status, MissionStatus.REJECTED);
    const afterConfirm =
      mission.status === MissionStatus.RESCUE_CONFIRMED ||
      mission.status === MissionStatus.PENDING_WAREHOUSE;
    const updated = await this.updateMissionIfCurrent(
      id,
      mission.status,
      { status: MissionStatus.REJECTED, rejectionReason: reason },
      MissionStatus.REJECTED,
    );
    await this.notifications.create({
      recipientRole: UserRole.ADMIN,
      kind: NotificationKind.MISSION_REJECTED,
      title: afterConfirm ? "Đội cứu hộ báo không tiếp tục được" : "Đội cứu hộ từ chối nhiệm vụ",
      body: `${mission.incidentType} — ${mission.affectedPeople} người. Lý do: ${reason}`,
      missionId: id,
    });
    // Đội rút khi kho đang chờ/chuẩn bị → báo kho dừng, chưa xuất thì khỏi xuất.
    if (afterConfirm) {
      await this.notifications.create({
        recipientRole: UserRole.WAREHOUSE,
        kind: NotificationKind.MISSION_REJECTED,
        title: "Tạm dừng chuẩn bị — đội cứu hộ đã rút",
        body: `${mission.incidentType} — ${mission.affectedPeople} người. Đội cứu hộ không tiếp tục được, chờ điều phối xử lý.`,
        missionId: id,
      });
    }
    return updated;
  }

  /**
   * ADMIN tiếp nhận đơn từ chối → tạm hoãn (REJECTED → DEFERRED), báo RESCUE.
   * Mission vào danh sách tạm hoãn để admin sửa/ghi chú rồi gửi lại sau.
   */
  async deferByAdmin(id: string, note?: string) {
    const mission = await this.requireMission(id);
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
   * ADMIN gửi lại nhiệm vụ tạm hoãn cho đội cứu hộ (DEFERRED → PENDING_RESCUE),
   * kèm ghi chú phản hồi. GIỮ NGUYÊN phương án phân bổ hiện tại — nếu cần đổi
   * nhân lực/vật tư (đội từ chối vì thiếu) thì admin lập phương án MỚI, không
   * dùng resend. Đội cứu hộ xác nhận / từ chối lại như bình thường.
   */
  async resendByAdmin(id: string, note?: string) {
    const mission = await this.requireMission(id);
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
   * ADMIN huỷ nhiệm vụ, kèm lý do gửi đội cứu hộ. Huỷ được ở mọi bước TRƯỚC khi
   * kho xuất vật tư (DRAFT/PENDING_RESCUE/RESCUE_CONFIRMED/PENDING_WAREHOUSE) và
   * từ REJECTED/DEFERRED. Kết thúc luồng — không gửi lại được nữa. Nếu đang chờ
   * kho chuẩn bị thì báo thêm WAREHOUSE dừng; đội cứu hộ luôn được báo.
   */
  async cancelByAdmin(id: string, note?: string) {
    const mission = await this.requireMission(id);
    this.guardTransition(mission.status, MissionStatus.CANCELLED);
    const warehouseWasWaiting =
      mission.status === MissionStatus.RESCUE_CONFIRMED ||
      mission.status === MissionStatus.PENDING_WAREHOUSE;
    const updated = await this.updateMissionIfCurrent(
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
  async completeByRescue(id: string, outcome: DeliveryOutcome, userId: string, note?: string) {
    const mission = await this.prisma.mission.findUnique({
      where: { id },
      include: { requirements: true },
    });
    if (!mission) throw new NotFoundException("Không tìm thấy nhiệm vụ");
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
        await this.inventory.bulkImportInTx(tx, userId, restockItems, `Hoàn kho: nhiệm vụ ${id} giao thất bại`);
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
        title: `Đội cứu hộ đã giao — ${label}`,
        body: `${mission.incidentType} — ${mission.affectedPeople} người. Kết quả: ${label}.${note ? ` Ghi chú: ${note}` : ""}${stockNote}`,
        missionId: id,
      });
    }
    return updated;
  }

  /** Danh sách nhiệm vụ (lọc theo trạng thái nếu truyền) — mới nhất trước. */
  listMissions(statuses?: MissionStatus[]) {
    return this.prisma.mission.findMany({
      where: statuses && statuses.length > 0 ? { status: { in: statuses } } : undefined,
      orderBy: { createdAt: "desc" },
      include: { requirements: true },
      take: 100,
    });
  }

  /**
   * WAREHOUSE chuẩn bị: xuất kho theo phương án (bulk-export) → READY,
   * notify ADMIN + RESCUE. Chỉ xuất phần đã cấp (allocated), bỏ phần thiếu.
   */
  async prepareByWarehouse(
    id: string,
    userId: string,
    scopeWarehouseId?: string | null,
  ) {
    const result = await this.prisma.$transaction(async (tx) => {
      const mission = await tx.mission.findUnique({
        where: { id },
        include: { requirements: true },
      });
      if (!mission) throw new NotFoundException("Không tìm thấy nhiệm vụ");
      assertWarehouseInScope(scopeWarehouseId, mission.warehouseId);

      // Retry sau khi request trước đã commit là idempotent: không xuất/notify lại.
      if (mission.status === MissionStatus.READY) {
        const current = await tx.mission.findUniqueOrThrow({ where: { id } });
        return { mission: current, prepared: false, batchIds: [] as string[] };
      }
      this.guardTransition(mission.status, MissionStatus.READY);

      // Claim có điều kiện trước khi xuất. Request đồng thời thứ hai sẽ chờ row lock,
      // rồi nhận count=0 sau khi request thắng đã commit READY.
      const claim = await tx.mission.updateMany({
        where: {
          id,
          status: MissionStatus.PENDING_WAREHOUSE,
          ...(scopeWarehouseId ? { warehouseId: scopeWarehouseId } : {}),
        },
        data: { status: MissionStatus.READY },
      });
      if (claim.count === 0) {
        const current = await tx.mission.findUnique({ where: { id } });
        if (!current) throw new NotFoundException("Không tìm thấy nhiệm vụ");
        if (current.status === MissionStatus.READY) {
          return { mission: current, prepared: false, batchIds: [] as string[] };
        }
        this.guardTransition(current.status, MissionStatus.READY);
        throw new BadRequestException("Nhiệm vụ đang được chuẩn bị, vui lòng thử lại");
      }

      const items = collectMissionBatches(mission.requirements);
      if (items.length > 0) {
        await this.inventory.bulkExportInTx(
          tx,
          userId,
          items,
          `Nhiệm vụ ${id}`,
          scopeWarehouseId,
        );
      }

      const updated = await tx.mission.findUniqueOrThrow({ where: { id } });
      return {
        mission: updated,
        prepared: true,
        batchIds: items.map((item) => item.batchId),
      };
    });

    if (!result.prepared) return result.mission;

    // Hậu xử lý không được làm client hiểu nhầm transaction đã rollback và retry.
    await this.inventory.recalcBatches(result.batchIds).catch((error) => {
      this.log.warn(`Recalc readiness sau prepare ${id} lỗi: ${errorMessage(error)}`);
    });
    const notifications = await Promise.allSettled(
      [UserRole.ADMIN, UserRole.RESCUE].map((role) =>
        this.notifications.create({
          recipientRole: role,
          kind: NotificationKind.WAREHOUSE_READY,
          title: "Kho đã chuẩn bị xong",
          body: `Vật tư cho ${result.mission.incidentType} đã sẵn sàng giao cho đội cứu hộ.`,
          missionId: id,
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

  private async requireMission(id: string) {
    const mission = await this.prisma.mission.findUnique({ where: { id } });
    if (!mission) throw new NotFoundException("Không tìm thấy nhiệm vụ");
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

  private assertMissionDispatchable(value: Prisma.JsonValue | null) {
    const assessment = value as unknown as MissionReadinessAssessment | null;
    if (assessment?.status !== "NOT_DISPATCHABLE") return;
    const blocker = assessment.blockers[0];
    const reason = blocker
      ? `${blocker.itemName}: ${blocker.reasons[0] ?? "không có lô đủ điều kiện"}`
      : "Không đủ vật tư thiết yếu đủ điều kiện";
    throw new BadRequestException(`Chưa thể điều phối nhiệm vụ: ${reason}.`);
  }

  /**
   * Sinh Incident Action Plan (K3): backend chấm severity + forecasts bằng RULE
   * (chống LLM bịa) → gom context → LLM viết phần diễn giải → ghép → lưu.
   * LLM lỗi/mất mạng → template fallback (demo không bao giờ trắng màn hình).
   */
  async generateActionPlan(id: string): Promise<ActionPlan> {
    const mission = await this.prisma.mission.findUnique({
      where: { id },
      include: { requirements: true },
    });
    if (!mission) throw new NotFoundException("Không tìm thấy nhiệm vụ");

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
      const context = buildActionPlanContext(incident, fulfillment, allocations, warehouses, severity, forecasts);
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

  /** Khoảng cách + ETA từ các kho đã cấp phát → điểm nạn (nếu có toạ độ). */
  private async warehouseEtas(mission: {
    warehouseId: string;
    incidentLat: number | null;
    incidentLng: number | null;
    requirements: { allocations: Prisma.JsonValue }[];
  }): Promise<WarehouseEta[]> {
    const names = new Set<string>();
    for (const r of mission.requirements) {
      for (const n of warehouseNamesOf(r.allocations)) names.add(n);
    }
    if (mission.incidentLat == null || mission.incidentLng == null || names.size === 0) return [];

    const warehouse = await this.prisma.warehouse.findUnique({ where: { id: mission.warehouseId } });
    const cluster = await this.prisma.warehouse.findMany({
      where: { communeId: warehouse?.communeId ?? "", name: { in: [...names] } },
    });
    const geolocated = cluster.filter((w) => w.lat != null && w.lng != null);
    if (geolocated.length === 0) return [];

    const origins = geolocated.map((w) => ({ lat: w.lat as number, lng: w.lng as number }));
    const dest = { lat: mission.incidentLat, lng: mission.incidentLng };
    const results = await this.geo.distanceAndEta(origins, dest);
    return geolocated.map((w, i) => ({
      name: w.name,
      distanceKm: results[i].km,
      etaMinutes: results[i].etaMinutes,
      lat: w.lat as number,
      lng: w.lng as number,
    }));
  }

  /** Toàn bộ kho (tổng + thôn) trong cụm xã, có toạ độ — cho map ghim điểm nạn (FE-K). */
  async listClusterWarehouses(warehouseId: string) {
    const warehouse = await this.prisma.warehouse.findUnique({ where: { id: warehouseId } });
    const cluster = await this.prisma.warehouse.findMany({
      where: { communeId: warehouse?.communeId ?? "" },
    });
    return cluster
      .filter((w) => w.lat != null && w.lng != null)
      .map((w) => ({ id: w.id, name: w.name, kind: w.kind, lat: w.lat as number, lng: w.lng as number }));
  }

  // ---- gom dữ liệu ----

  /**
   * Lô khả dụng CẢ CỤM KHO cùng xã (K1): IN_STOCK, không hỏng, quantity > phần
   * đang mượn. Gắn khoảng cách kho→điểm nạn (GeoService) để greedy ưu tiên kho gần.
   * Không có điểm nạn / kho chưa ghim toạ độ → distanceKm=0 (không ưu tiên, chỉ FEFO).
   */
  private async loadClusterBatches(
    communeId: string,
    requiredSkus: string[],
    incidentPoint?: LatLng,
  ): Promise<{
    available: AvailableBatch[];
    unavailableReasonsBySku: Map<string, string[]>;
  }> {
    const warehouses = await this.prisma.warehouse.findMany({ where: { communeId } });
    const readinessByWarehouse = new Map(
      await Promise.all(
        warehouses.map(async (warehouse) => [
          warehouse.id,
          await this.readiness.getWarehouseScore(warehouse.id),
        ] as const),
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
    const origins = geolocated.map((w) => ({ lat: w.lat as number, lng: w.lng as number }));
    const distances = await this.geo.distanceAndEta(origins, incidentPoint);
    geolocated.forEach((w, i) => result.set(w.id, distances[i].km));

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
    (a) => `- ${a.itemName}: cần ${a.required} ${a.unit}, cấp ${a.allocated}, thiếu ${a.shortage}` +
      (a.fromWarehouses.length ? ` (từ ${a.fromWarehouses.join(", ")})` : ""),
  );
  const whLines = warehouses.map((w) => `- ${w.name}: ${w.distanceKm}km, ~${w.etaMinutes} phút`);
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
