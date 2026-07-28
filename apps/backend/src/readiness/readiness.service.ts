import { Injectable, Logger } from "@nestjs/common";
import {
  IncidentState,
  LoanStatus,
  NotificationKind,
  Prisma,
  UserRole,
  VirtualDeviceType,
} from "@prisma/client";
import { READINESS_WEIGHTS } from "@safestock/shared-types";
import { NotificationService } from "../notification/notification.service";
import { PrismaService } from "../prisma/prisma.service";
import { ActionThresholds, DEFAULT_THRESHOLDS, resolveActionZone } from "./action-zone";
import { computeBatchReadiness, rollupReadiness } from "./compute";
import {
  BatchWithContext,
  daysBetween,
  toBatchReadinessInput,
  ZoneEnvironment,
} from "./readiness.gather";
import { buildRecommendations } from "./recommendations";
import {
  assessOperationalReadiness,
  OperationalReadinessAssessment,
} from "./operational-readiness";
import { ReadinessResult, WeightedReadiness } from "./readiness.types";

/** Cảm biến không cập nhật quá ngưỡng này coi như "chết" — hạ độ tin cậy (#25). */
const SENSOR_FRESH_MS = 30 * 60 * 1000;

/** Điểm 1 kệ kèm breakdown + danh sách điểm lô con (để persist cấp lô nếu cần). */
interface ShelfReadiness extends WeightedReadiness {
  shelfId: string;
  zoneId: string;
}

@Injectable()
export class ReadinessService {
  private readonly log = new Logger(ReadinessService.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationService,
  ) {}

  /**
   * Tính điểm toàn kho ở 4 cấp (lô→kệ→khu→kho) và lưu bản mới nhất.
   * @param now mốc thời gian server (#31); mặc định thời điểm gọi.
   */
  async recalculateWarehouse(warehouseId: string, now: Date = new Date()) {
    const env = await this.loadZoneEnvironments(warehouseId, now);
    const shelves = await this.loadShelfContexts(warehouseId, env, now);

    const shelfScores = this.scoreShelves(shelves, now);
    const zoneScores = this.scoreZones(shelfScores);
    const warehouseScore = rollupReadiness(shelfScores);

    const thresholds = await this.loadThresholds(warehouseId);
    const oldScore = await this.prisma.readinessScore.findUnique({
      where: { targetType_targetId: { targetType: "WAREHOUSE", targetId: warehouseId } },
      select: { score: true, operationalStatus: true },
    });
    const newZone = resolveActionZone(warehouseScore.score, thresholds);
    const assessment = await this.assessWarehouse(warehouseId, warehouseScore);

    await this.persist(warehouseId, warehouseScore, zoneScores, shelfScores, assessment);

    if (
      oldScore?.operationalStatus !== assessment.operationalStatus &&
      assessment.operationalStatus !== "READY"
    ) {
      const warehouse = await this.prisma.warehouse.findUnique({
        where: { id: warehouseId },
        select: { organizationId: true },
      });
      const reason = assessment.blockers[0]?.title ?? assessment.recommendedActions[0];
      if (warehouse) await this.notifications
        .create({
          recipientRole: UserRole.WAREHOUSE,
          kind: NotificationKind.READINESS_DEGRADED,
          title:
            assessment.operationalStatus === "NOT_DISPATCHABLE"
              ? "Kho tạm thời không thể điều phối"
              : "Kho có việc cần xử lý",
          body: reason ?? `Điểm tham khảo hiện tại ${warehouseScore.score}/100`,
          warehouseId,
          organizationId: warehouse.organizationId,
        })
        .catch((error) => {
          this.log.warn(`Gửi thông báo readiness lỗi (kho ${warehouseId}): ${error.message}`);
        });
    }

    return {
      warehouseId,
      score: warehouseScore.score,
      zone: newZone,
      zones: zoneScores.size,
      ...assessment,
    };
  }

  /** Đọc điểm đã lưu của 1 target bất kỳ (ZONE/SHELF/ITEM_BATCH) — không tính lại. */
  async getScore(targetType: "ZONE" | "SHELF" | "ITEM_BATCH", targetId: string) {
    return this.prisma.readinessScore.findUnique({
      where: { targetType_targetId: { targetType, targetId } },
      include: { components: true },
    });
  }

  /** Đọc điểm đã lưu của 1 kho kèm vùng hành động + đề xuất (không tính lại). */
  async getWarehouseScore(warehouseId: string) {
    const score = await this.prisma.readinessScore.findUnique({
      where: {
        targetType_targetId: { targetType: "WAREHOUSE", targetId: warehouseId },
      },
      include: { components: true, recommendations: true },
    });
    if (!score) return null;

    const thresholds = await this.loadThresholds(warehouseId);
    const assessment = await this.assessWarehouse(warehouseId, {
      score: score.score,
      components: score.components.map((component) => ({
        key: component.key as ReadinessResult["components"][number]["key"],
        score: component.value,
        reasons: component.reasons,
      })),
    });
    return {
      ...score,
      zone: resolveActionZone(score.score, thresholds),
      ...assessment,
    };
  }

  /** Kết luận vận hành dùng sự cố chưa xử lý tại thời điểm đọc, tránh trạng thái bị cũ. */
  private async assessWarehouse(
    warehouseId: string,
    readiness: ReadinessResult,
  ): Promise<OperationalReadinessAssessment> {
    const openIncidents = await this.prisma.incident.findMany({
      where: { warehouseId, state: { not: IncidentState.RESOLVED } },
      select: { kind: true, severity: true, title: true },
    });
    return assessOperationalReadiness({
      referenceScore: readiness.score,
      components: readiness.components,
      openIncidents,
    });
  }

  /** Đề xuất cải thiện của 1 kho (đã lưu lúc recalc). */
  async getRecommendations(warehouseId: string) {
    const score = await this.prisma.readinessScore.findUnique({
      where: {
        targetType_targetId: { targetType: "WAREHOUSE", targetId: warehouseId },
      },
      include: { recommendations: true },
    });
    return score?.recommendations ?? [];
  }

  /** Ngưỡng hành động của kho (cấu hình được); rỗng → mặc định. */
  private async loadThresholds(warehouseId: string): Promise<ActionThresholds> {
    const row = await this.prisma.readinessThreshold.findUnique({
      where: { warehouseId },
    });
    if (!row) return DEFAULT_THRESHOLDS;
    return { ready: row.ready, attention: row.attention, degraded: row.degraded };
  }

  // ---- gom dữ liệu ----

  /** Môi trường hiện tại + độ tươi cảm biến theo từng khu. */
  private async loadZoneEnvironments(
    warehouseId: string,
    now: Date,
  ): Promise<Map<string, ZoneEnvironment>> {
    const devices = await this.prisma.virtualDevice.findMany({
      where: {
        warehouseId,
        type: { in: [VirtualDeviceType.TEMPERATURE, VirtualDeviceType.HUMIDITY] },
      },
    });

    const byZone = new Map<string, ZoneEnvironment>();
    for (const device of devices) {
      if (!device.zoneId) continue;
      const zone =
        byZone.get(device.zoneId) ??
        ({ temperature: null, humidity: null, sensorFresh: true } as ZoneEnvironment);
      const fresh = now.getTime() - device.updatedAt.getTime() < SENSOR_FRESH_MS;
      if (device.type === VirtualDeviceType.TEMPERATURE) {
        zone.temperature = device.currentValue;
      } else {
        zone.humidity = device.currentValue;
      }
      // Khu coi là "tươi" chỉ khi MỌI cảm biến của nó còn cập nhật.
      zone.sensorFresh = zone.sensorFresh && fresh;
      byZone.set(device.zoneId, zone);
    }
    return byZone;
  }

  /** Lô + ngữ cảnh (kệ, kiểm kê, mượn, môi trường) theo từng kệ. */
  private async loadShelfContexts(
    warehouseId: string,
    envByZone: Map<string, ZoneEnvironment>,
    now: Date,
  ): Promise<Map<string, { zoneId: string; batches: BatchWithContext[] }>> {
    const shelves = await this.prisma.shelf.findMany({
      where: { zone: { warehouseId } },
      include: {
        zone: true,
        batches: {
          include: {
            counts: { orderBy: { countedAt: "desc" }, take: 1 },
            loans: {
              where: {
                status: { in: [LoanStatus.ON_LOAN, LoanStatus.PARTIALLY_RETURNED] },
              },
            },
          },
        },
      },
    });

    const defaultEnv: ZoneEnvironment = {
      temperature: null,
      humidity: null,
      sensorFresh: true,
    };

    const result = new Map<string, { zoneId: string; batches: BatchWithContext[] }>();
    for (const shelf of shelves) {
      const env = envByZone.get(shelf.zoneId) ?? defaultEnv;
      const batches: BatchWithContext[] = shelf.batches.map((batch) => {
        const lastCount = batch.counts[0] ?? null;
        const onLoanQty = batch.loans.reduce(
          (sum, loan) => sum + (loan.quantity - loan.returnedOk - loan.returnedDamaged - loan.lost),
          0,
        );
        return {
          batch,
          isLocked: shelf.isLocked,
          countedQty: lastCount?.countedQty ?? null,
          daysSinceLastCount: lastCount ? daysBetween(lastCount.countedAt, now) : null,
          onLoanQty,
          env,
        };
      });
      result.set(shelf.id, { zoneId: shelf.zoneId, batches });
    }
    return result;
  }

  // ---- tính điểm 4 cấp (thuần, đã có dữ liệu) ----

  private scoreShelves(
    shelves: Map<string, { zoneId: string; batches: BatchWithContext[] }>,
    now: Date,
  ): ShelfReadiness[] {
    const result: ShelfReadiness[] = [];
    for (const [shelfId, { zoneId, batches }] of shelves) {
      const batchScores = batches.map((ctx) =>
        computeBatchReadiness(toBatchReadinessInput(ctx, now)),
      );
      const rolled = rollupReadiness(batchScores);
      result.push({
        shelfId,
        zoneId,
        score: rolled.score,
        weight: batchScores.reduce((sum, b) => sum + b.weight, 0),
        components: rolled.components,
      });
    }
    return result;
  }

  private scoreZones(shelves: ShelfReadiness[]): Map<string, ReadinessResult> {
    const byZone = new Map<string, ShelfReadiness[]>();
    for (const shelf of shelves) {
      const list = byZone.get(shelf.zoneId) ?? [];
      list.push(shelf);
      byZone.set(shelf.zoneId, list);
    }
    const result = new Map<string, ReadinessResult>();
    for (const [zoneId, list] of byZone) {
      result.set(zoneId, rollupReadiness(list));
    }
    return result;
  }

  // ---- lưu (ghi đè bản mới nhất theo target) ----

  private async persist(
    warehouseId: string,
    warehouse: ReadinessResult,
    zones: Map<string, ReadinessResult>,
    shelves: ShelfReadiness[],
    assessment: OperationalReadinessAssessment,
  ) {
    const writes = [
      this.upsertScore(warehouseId, "WAREHOUSE", warehouseId, warehouse, assessment),
      ...[...zones].map(([zoneId, result]) =>
        this.upsertScore(warehouseId, "ZONE", zoneId, result),
      ),
      ...shelves.map((shelf) => this.upsertScore(warehouseId, "SHELF", shelf.shelfId, shelf)),
    ];
    await this.prisma.$transaction(writes);
  }

  private upsertScore(
    warehouseId: string,
    targetType: "WAREHOUSE" | "ZONE" | "SHELF",
    targetId: string,
    result: ReadinessResult,
    assessment?: OperationalReadinessAssessment,
  ) {
    const componentData = result.components.map((component) => ({
      key: component.key,
      value: component.score,
      weight: READINESS_WEIGHTS[component.key],
      reasons: component.reasons,
    }));
    // Chỉ sinh đề xuất ở cấp kho (cấp cao nhất, tránh trùng lặp cấp kệ/khu).
    const recommendationData =
      targetType === "WAREHOUSE"
        ? buildRecommendations(result.components).map((rec) => ({
            component: rec.component,
            message: rec.message,
          }))
        : [];

    return this.prisma.readinessScore.upsert({
      where: { targetType_targetId: { targetType, targetId } },
      create: {
        warehouseId,
        targetType,
        targetId,
        score: result.score,
        operationalStatus: assessment?.operationalStatus ?? "READY",
        blockers: (assessment?.blockers ?? []) as unknown as Prisma.InputJsonValue,
        components: { create: componentData },
        recommendations: { create: recommendationData },
      },
      update: {
        score: result.score,
        computedAt: new Date(),
        ...(assessment
          ? {
              operationalStatus: assessment.operationalStatus,
              blockers: assessment.blockers as unknown as Prisma.InputJsonValue,
            }
          : {}),
        components: { deleteMany: {}, create: componentData },
        recommendations: { deleteMany: {}, create: recommendationData },
      },
    });
  }
}
