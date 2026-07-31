import { Injectable, Logger } from "@nestjs/common";
import {
  IncidentState,
  LoanStatus,
  NotificationKind,
  UserRole,
  VirtualDeviceType,
  WarehouseKind,
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
import {
  assessOperationalReadiness,
  OperationalReadinessAssessment,
} from "./operational-readiness";
import { buildRecommendations } from "./recommendations";
import { ReadinessResult, WeightedReadiness } from "./readiness.types";

const SENSOR_FRESH_MS = 30 * 60_000;

interface ShelfReadiness extends WeightedReadiness {
  shelfId: string;
  zoneId: string;
}

interface ComputedWarehouseReadiness {
  warehouseId: string;
  computedAt: Date;
  warehouse: ReadinessResult;
  zones: Map<string, ReadinessResult>;
  shelves: ShelfReadiness[];
  assessment: OperationalReadinessAssessment;
  thresholds: ActionThresholds;
}

/**
 * Readiness is a calculation, not another persistent current-state model.
 * Each result reads inventory, incidents, and the newest sensor history; the
 * small runtime map is only used to avoid repeating transition notifications.
 */
@Injectable()
export class ReadinessService {
  private readonly log = new Logger(ReadinessService.name);
  private readonly operationalStatusByWarehouse = new Map<string, string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
  ) {}

  async recalculateWarehouse(warehouseId: string, now = new Date()) {
    let lastError: unknown;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const calculated = await this.calculateWarehouse(warehouseId, now);
        await this.notifyOperationalTransition(calculated);
        return this.toWarehouseResponse(calculated);
      } catch (error) {
        lastError = error;
        this.log.warn(
          `Recalc readiness lỗi (kho ${warehouseId}, lần ${attempt}/3): ${messageOf(error)}`,
        );
      }
    }
    throw lastError;
  }

  async recalculateWarehouseBestEffort(warehouseId: string, context: string): Promise<boolean> {
    try {
      await this.recalculateWarehouse(warehouseId);
      return true;
    } catch (error) {
      this.log.warn(
        `Không thể làm mới readiness (${context}, kho ${warehouseId}): ${messageOf(error)}`,
      );
      return false;
    }
  }

  async getWarehouseScore(warehouseId: string, now = new Date()) {
    const calculated = await this.calculateWarehouse(warehouseId, now);
    return this.toWarehouseResponse(calculated);
  }

  async getScore(targetType: "ZONE" | "SHELF" | "ITEM_BATCH", targetId: string) {
    const warehouseId = await this.warehouseForTarget(targetType, targetId);
    if (!warehouseId) return null;
    const calculated = await this.calculateWarehouse(warehouseId);
    if (targetType === "ZONE") {
      const result = calculated.zones.get(targetId);
      return result
        ? this.toTargetResponse(warehouseId, targetType, targetId, result, calculated.computedAt)
        : null;
    }
    if (targetType === "SHELF") {
      const result = calculated.shelves.find((shelf) => shelf.shelfId === targetId);
      return result
        ? this.toTargetResponse(warehouseId, targetType, targetId, result, calculated.computedAt)
        : null;
    }
    return null;
  }

  async getRecommendations(warehouseId: string) {
    const calculated = await this.calculateWarehouse(warehouseId);
    return buildRecommendations(calculated.warehouse.components).map((recommendation) => ({
      id: `${warehouseId}:${recommendation.component}`,
      ...recommendation,
    }));
  }

  private async calculateWarehouse(
    warehouseId: string,
    now = new Date(),
  ): Promise<ComputedWarehouseReadiness> {
    const env = await this.loadZoneEnvironments(warehouseId, now);
    const shelves = await this.loadShelfContexts(warehouseId, env, now);
    const shelfScores = this.scoreShelves(shelves, now);
    const zoneScores = this.scoreZones(shelfScores);
    const warehouse = rollupReadiness(shelfScores);
    const [thresholds, assessment] = await Promise.all([
      this.loadThresholds(warehouseId),
      this.assessWarehouse(warehouseId, warehouse),
    ]);
    return {
      warehouseId,
      computedAt: now,
      warehouse,
      zones: zoneScores,
      shelves: shelfScores,
      assessment,
      thresholds,
    };
  }

  private async notifyOperationalTransition(calculated: ComputedWarehouseReadiness): Promise<void> {
    const next = calculated.assessment.operationalStatus;
    const previous = this.operationalStatusByWarehouse.get(calculated.warehouseId);
    this.operationalStatusByWarehouse.set(calculated.warehouseId, next);
    if (previous === next || next === "READY") return;
    const reason =
      calculated.assessment.blockers[0]?.title ?? calculated.assessment.recommendedActions[0];
    await this.notifications
      .create({
        recipientRole: UserRole.WAREHOUSE,
        kind: NotificationKind.READINESS_DEGRADED,
        title:
          next === "NOT_DISPATCHABLE"
            ? "Kho tạm thời không thể điều phối"
            : "Kho có việc cần xử lý",
        body: reason ?? `Điểm tham khảo hiện tại ${calculated.warehouse.score}/100`,
        warehouseId: calculated.warehouseId,
      })
      .catch((error) => this.log.warn(`Gửi thông báo readiness lỗi: ${messageOf(error)}`));
  }

  private toWarehouseResponse(calculated: ComputedWarehouseReadiness) {
    const { warehouse, assessment, thresholds, warehouseId, computedAt } = calculated;
    return {
      id: `runtime:${warehouseId}`,
      warehouseId,
      targetType: "WAREHOUSE" as const,
      targetId: warehouseId,
      score: warehouse.score,
      zone: resolveActionZone(warehouse.score, thresholds),
      computedAt,
      components: toComponents(warehouse),
      recommendations: buildRecommendations(warehouse.components).map((recommendation) => ({
        id: `${warehouseId}:${recommendation.component}`,
        ...recommendation,
      })),
      isStale: false,
      ageMs: 0,
      ...assessment,
    };
  }

  private toTargetResponse(
    warehouseId: string,
    targetType: "ZONE" | "SHELF",
    targetId: string,
    result: ReadinessResult,
    computedAt: Date,
  ) {
    return {
      id: `runtime:${targetType}:${targetId}`,
      warehouseId,
      targetType,
      targetId,
      score: result.score,
      computedAt,
      components: toComponents(result),
    };
  }

  private async warehouseForTarget(
    targetType: "ZONE" | "SHELF" | "ITEM_BATCH",
    targetId: string,
  ): Promise<string | null> {
    if (targetType === "ZONE") {
      return (
        (
          await this.prisma.warehouseZone.findUnique({
            where: { id: targetId },
            select: { warehouseId: true },
          })
        )?.warehouseId ?? null
      );
    }
    if (targetType === "SHELF") {
      return (
        (
          await this.prisma.shelf.findUnique({
            where: { id: targetId },
            select: { zone: { select: { warehouseId: true } } },
          })
        )?.zone.warehouseId ?? null
      );
    }
    return (
      (
        await this.prisma.itemBatch.findUnique({
          where: { id: targetId },
          select: { shelf: { select: { zone: { select: { warehouseId: true } } } } },
        })
      )?.shelf?.zone.warehouseId ?? null
    );
  }

  private async assessWarehouse(warehouseId: string, readiness: ReadinessResult) {
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

  private async loadThresholds(warehouseId: string): Promise<ActionThresholds> {
    const row = await this.prisma.readinessThreshold.findUnique({ where: { warehouseId } });
    return row
      ? { ready: row.ready, attention: row.attention, degraded: row.degraded }
      : DEFAULT_THRESHOLDS;
  }

  private async loadZoneEnvironments(
    warehouseId: string,
    now: Date,
  ): Promise<Map<string, ZoneEnvironment>> {
    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id: warehouseId },
      select: { kind: true },
    });
    if (warehouse?.kind === WarehouseKind.HAMLET) return new Map();
    const devices = await this.prisma.virtualDevice.findMany({
      where: {
        warehouseId,
        type: { in: [VirtualDeviceType.TEMPERATURE, VirtualDeviceType.HUMIDITY] },
      },
      select: {
        zoneId: true,
        type: true,
        events: {
          orderBy: [{ observedAt: "desc" }, { createdAt: "desc" }],
          take: 1,
          select: { value: true, observedAt: true },
        },
      },
    });
    const byZone = new Map<string, ZoneEnvironment>();
    for (const device of devices) {
      if (!device.zoneId) continue;
      const zone = byZone.get(device.zoneId) ?? {
        temperature: null,
        humidity: null,
        sensorFresh: true,
      };
      const latest = device.events[0];
      const fresh = Boolean(
        latest && now.getTime() - latest.observedAt.getTime() < SENSOR_FRESH_MS,
      );
      zone.sensorFresh = zone.sensorFresh && fresh;
      if (device.type === VirtualDeviceType.TEMPERATURE) zone.temperature = latest?.value ?? null;
      else zone.humidity = latest?.value ?? null;
      byZone.set(device.zoneId, zone);
    }
    return byZone;
  }

  private async loadShelfContexts(
    warehouseId: string,
    envByZone: Map<string, ZoneEnvironment>,
    now: Date,
  ): Promise<Map<string, { zoneId: string; batches: BatchWithContext[] }>> {
    const shelves = await this.prisma.shelf.findMany({
      where: { zone: { warehouseId } },
      include: {
        batches: {
          include: {
            counts: { orderBy: { countedAt: "desc" }, take: 1 },
            loans: {
              where: { status: { in: [LoanStatus.ON_LOAN, LoanStatus.PARTIALLY_RETURNED] } },
            },
          },
        },
      },
    });
    const result = new Map<string, { zoneId: string; batches: BatchWithContext[] }>();
    for (const shelf of shelves) {
      const env = envByZone.get(shelf.zoneId) ?? {
        temperature: null,
        humidity: null,
        sensorFresh: true,
      };
      result.set(shelf.id, {
        zoneId: shelf.zoneId,
        batches: shelf.batches.map((batch) => {
          const latestCount = batch.counts[0] ?? null;
          return {
            batch,
            isLocked: shelf.isLocked,
            countedQty: latestCount?.countedQty ?? null,
            daysSinceLastCount: latestCount ? daysBetween(latestCount.countedAt, now) : null,
            onLoanQty: batch.loans.reduce(
              (sum, loan) =>
                sum + loan.quantity - loan.returnedOk - loan.returnedDamaged - loan.lost,
              0,
            ),
            env,
          };
        }),
      });
    }
    return result;
  }

  private scoreShelves(
    shelves: Map<string, { zoneId: string; batches: BatchWithContext[] }>,
    now: Date,
  ): ShelfReadiness[] {
    return [...shelves].map(([shelfId, shelf]) => {
      const batchScores = shelf.batches.map((batch) =>
        computeBatchReadiness(toBatchReadinessInput(batch, now)),
      );
      const result = rollupReadiness(batchScores);
      return {
        shelfId,
        zoneId: shelf.zoneId,
        score: result.score,
        weight: batchScores.reduce((sum, batch) => sum + batch.weight, 0),
        components: result.components,
      };
    });
  }

  private scoreZones(shelves: ShelfReadiness[]): Map<string, ReadinessResult> {
    const byZone = new Map<string, ShelfReadiness[]>();
    for (const shelf of shelves)
      byZone.set(shelf.zoneId, [...(byZone.get(shelf.zoneId) ?? []), shelf]);
    return new Map([...byZone].map(([zoneId, values]) => [zoneId, rollupReadiness(values)]));
  }
}

function toComponents(result: ReadinessResult) {
  return result.components.map((component) => ({
    key: component.key,
    value: component.score,
    weight: READINESS_WEIGHTS[component.key],
    reasons: component.reasons,
  }));
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
