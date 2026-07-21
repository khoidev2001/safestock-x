import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { MissionStatus, NotificationKind, Prisma, UserRole } from "@prisma/client";
import { IncidentType } from "@safestock/shared-types";
import { AiClientService } from "../ai/ai-client.service";
import { GeoService } from "../geo/geo.service";
import { LatLng } from "../geo/haversine";
import { InventoryService } from "../inventory/inventory.service";
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
    return this.prisma.mission.update({
      where: { id },
      data: { status: MissionStatus.APPROVED, approvedByUserId: userId, approvedAt: new Date() },
    });
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
    const updated = await this.prisma.mission.update({
      where: { id },
      data: { status: MissionStatus.PENDING_RESCUE },
    });
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
    const updated = await this.prisma.mission.update({
      where: { id },
      data: { status: MissionStatus.PENDING_WAREHOUSE },
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
   * WAREHOUSE chuẩn bị: xuất kho theo phương án (bulk-export) → READY,
   * notify ADMIN + RESCUE. Chỉ xuất phần đã cấp (allocated), bỏ phần thiếu.
   */
  async prepareByWarehouse(id: string, userId: string) {
    const mission = await this.prisma.mission.findUnique({
      where: { id },
      include: { requirements: true },
    });
    if (!mission) throw new NotFoundException("Không tìm thấy nhiệm vụ");
    this.guardTransition(mission.status, MissionStatus.READY);

    // Gom lô cần xuất từ allocations JSON.
    const items = mission.requirements.flatMap((r) =>
      ((r.allocations as { batchId: string; qty: number }[]) ?? []).map((a) => ({
        batchId: a.batchId,
        quantity: a.qty,
      })),
    );
    if (items.length > 0) {
      await this.inventory.bulkExport(userId, items, `Nhiệm vụ ${id}`);
    }

    const updated = await this.prisma.mission.update({
      where: { id },
      data: { status: MissionStatus.READY },
    });
    for (const role of [UserRole.ADMIN, UserRole.RESCUE]) {
      await this.notifications.create({
        recipientRole: role,
        kind: NotificationKind.WAREHOUSE_READY,
        title: "Kho đã chuẩn bị xong",
        body: `Vật tư cho ${mission.incidentType} đã sẵn sàng giao cho đội cứu hộ.`,
        missionId: id,
      });
    }
    return updated;
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

function addUnavailableReason(reasonsBySku: Map<string, string[]>, sku: string, reason: string) {
  const reasons = reasonsBySku.get(sku) ?? [];
  if (!reasons.includes(reason)) reasons.push(reason);
  reasonsBySku.set(sku, reasons);
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
