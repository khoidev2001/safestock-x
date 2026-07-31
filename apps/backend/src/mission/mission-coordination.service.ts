import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  CoordinationAnalysis,
  FieldUpdateIntent,
  MissionFieldUpdatePayload,
  WhatIfAssumption,
  validateCoordinationAnalysis,
  validateFieldUpdateIntent,
  validateFieldUpdatePayload,
  validateWhatIfAssumptions,
} from "@safestock/shared-types";
import { AuditService } from "../rbac/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { assertActorCanAccessWarehouse } from "../inventory/warehouse-scope";

type SnapshotKind = "BASELINE" | "WHAT_IF";

export interface SaveAnalysisSnapshotInput {
  kind: SnapshotKind;
  requestId?: string;
  fingerprint: string;
  baselineSnapshotId?: string;
  input: Record<string, unknown>;
  provenance: Record<string, unknown>;
  result: CoordinationAnalysis;
  assumptions?: WhatIfAssumption[];
  modelVersion: string;
  ruleVersion: string;
  geoRegistryVersion?: string;
  routingGraphVersion?: string;
  weatherSnapshotVersion?: string;
  expiresAt?: Date;
}

/**
 * Narrow surface used until the generated Prisma client is refreshed after the
 * additive schema change. Keeping it here prevents a stale generated client
 * from weakening the runtime validation and persistence boundary.
 */
interface CoordinationPersistence {
  mission: {
    findUnique(args: unknown): Promise<{ id: string; warehouseId: string } | null>;
  };
  missionFieldUpdate: {
    findUnique(args: unknown): Promise<Record<string, unknown> | null>;
    create(args: unknown): Promise<Record<string, unknown>>;
    update(args: unknown): Promise<Record<string, unknown>>;
    findMany(args: unknown): Promise<Record<string, unknown>[]>;
  };
  missionAnalysisSnapshot: {
    findUnique(args: unknown): Promise<{
      id: string;
      missionId?: string;
      kind?: SnapshotKind;
      fingerprint: string;
      input?: unknown;
      provenance?: unknown;
      result?: unknown;
      assumptions?: unknown;
      modelVersion?: string;
      ruleVersion?: string;
      geoRegistryVersion?: string | null;
      routingGraphVersion?: string | null;
      weatherSnapshotVersion?: string | null;
      computedAt?: Date;
      expiresAt?: Date | null;
    } | null>;
    create(args: unknown): Promise<Record<string, unknown>>;
    findMany(args: unknown): Promise<Record<string, unknown>[]>;
  };
}

@Injectable()
export class MissionCoordinationService {
  private readonly db: CoordinationPersistence;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {
    this.db = prisma as unknown as CoordinationPersistence;
  }

  /**
   * Stores only the final, human-confirmed transcription. It intentionally
   * accepts neither raw recording/media nor continuous location data.
   */
  async recordFieldUpdate(
    missionId: string,
    actorId: string,
    scopeWarehouseId: string | null | undefined,
    rawPayload: unknown,
  ) {
    const errors = validateFieldUpdatePayload(rawPayload);
    if (errors.length) {
      throw new BadRequestException({ code: "VALIDATION_ERROR", errors });
    }
    const payload = rawPayload as MissionFieldUpdatePayload;
    await this.assertMissionAccess(missionId, actorId, scopeWarehouseId);

    const existing = await this.db.missionFieldUpdate.findUnique({
      where: {
        missionId_actorId_requestId: {
          missionId,
          actorId,
          requestId: payload.requestId,
        },
      },
    });
    if (existing) return existing;

    try {
      const created = await this.db.missionFieldUpdate.create({
        data: {
          missionId,
          actorId,
          requestId: payload.requestId.trim(),
          inputMode: payload.inputMode,
          confirmedText: payload.confirmedText.trim(),
          clientCapturedAt: payload.clientCapturedAt
            ? new Date(payload.clientCapturedAt)
            : undefined,
        },
      });
      await this.audit.record({
        actorId,
        action: "MISSION_FIELD_UPDATE_RECORDED",
        entity: "MissionFieldUpdate",
        entityId: String(created.id),
        warehouseId: (await this.getMissionWarehouseId(missionId)) ?? undefined,
        correlationId: payload.requestId.trim(),
        reason: "Lực lượng hiện trường đã xác nhận nội dung cập nhật",
        metadata: {
          inputMode: payload.inputMode,
          confirmedTextLength: payload.confirmedText.trim().length,
          containsMedia: false,
          containsContinuousGps: false,
        },
      });
      return created;
    } catch (error) {
      const retry = await this.findFieldUpdateAfterUniqueConflict(
        missionId,
        actorId,
        payload.requestId,
        error,
      );
      if (retry) return retry;
      throw error;
    }
  }

  async listFieldUpdates(
    missionId: string,
    actorId: string,
    scopeWarehouseId: string | null | undefined,
  ) {
    await this.assertMissionAccess(missionId, actorId, scopeWarehouseId);
    return this.db.missionFieldUpdate.findMany({
      where: { missionId },
      orderBy: { createdAt: "desc" },
      include: { actor: { select: { id: true, fullName: true, role: true } } },
    });
  }

  /**
   * Attaches a validated, review-required AI label after the human-confirmed
   * evidence itself has been committed. This path never edits mission state,
   * inventory, routes, or an existing evidence text.
   */
  async saveFieldUpdateIntent(
    missionId: string,
    actorId: string,
    scopeWarehouseId: string | null | undefined,
    fieldUpdate: { id: string; confirmedText: string },
    intent: FieldUpdateIntent,
    provenance: Record<string, unknown>,
  ) {
    const errors = validateFieldUpdateIntent(intent);
    if (!includesFolded(fieldUpdate.confirmedText, intent.sourceExcerpt)) {
      errors.push("field update intent sourceExcerpt is not grounded in confirmedText");
    }
    for (const fact of intent.facts) {
      if (fact.provenance === "REPORTED") {
        if (fact.source.sourceType !== "FIELD_UPDATE" || fact.source.sourceId !== fieldUpdate.id) {
          errors.push("field update intent reported facts must use this field update source");
        }
        if (
          fact.source.excerpt == null ||
          !includesFolded(fieldUpdate.confirmedText, fact.source.excerpt)
        ) {
          errors.push("field update intent fact excerpt is not grounded in confirmedText");
        }
      }
    }
    if (errors.length) throw new BadRequestException({ code: "VALIDATION_ERROR", errors });
    await this.assertMissionAccess(missionId, actorId, scopeWarehouseId);
    const saved = await this.db.missionFieldUpdate.update({
      where: { id: fieldUpdate.id },
      data: {
        structuredIntent: intent as unknown as Prisma.InputJsonValue,
        intentProvenance: provenance as unknown as Prisma.InputJsonValue,
      },
    });
    await this.audit.record({
      actorId,
      action: "MISSION_FIELD_UPDATE_INTENT_SAVED",
      entity: "MissionFieldUpdate",
      entityId: fieldUpdate.id,
      warehouseId: (await this.getMissionWarehouseId(missionId)) ?? undefined,
      reason: "AI gắn nhãn evidence hiện trường để ADMIN xem xét",
      metadata: {
        kind: intent.kind,
        confidence: intent.confidence,
        requiresAdminVerification: true,
        unresolvedReferenceCount: intent.unresolvedReferences.length,
      },
    });
    return saved;
  }

  /**
   * Internal persistence boundary for the baseline analysis and future What-if
   * results. The route that computes an analysis is added in AI-2; no client
   * can post an arbitrary recommendation directly to this method.
   */
  async saveAnalysisSnapshot(
    missionId: string,
    actorId: string,
    scopeWarehouseId: string | null | undefined,
    input: SaveAnalysisSnapshotInput,
  ) {
    const validationErrors = validateCoordinationAnalysis(input.result);
    const assumptionErrors = input.assumptions ? validateWhatIfAssumptions(input.assumptions) : [];
    const scalarErrors = this.validateSnapshotInput(input);
    const errors = [...validationErrors, ...assumptionErrors, ...scalarErrors];
    if (errors.length) {
      throw new BadRequestException({ code: "VALIDATION_ERROR", errors });
    }

    await this.assertMissionAccess(missionId, actorId, scopeWarehouseId);
    if (input.requestId) {
      const existing = await this.db.missionAnalysisSnapshot.findUnique({
        where: { missionId_requestId: { missionId, requestId: input.requestId.trim() } },
      });
      if (existing) {
        if (existing.fingerprint === input.fingerprint.trim()) return existing;
        throw new ConflictException({
          code: "VALIDATION_ERROR",
          message: "requestId đã được dùng cho một nội dung phân tích khác",
        });
      }
    }

    if (input.kind === "WHAT_IF") {
      const baseline = await this.db.missionAnalysisSnapshot.findUnique({
        where: { id: input.baselineSnapshotId },
      });
      if (!baseline || baseline.missionId !== missionId || baseline.kind !== "BASELINE") {
        throw new BadRequestException({
          code: "STALE_BASELINE",
          message: "Baseline không tồn tại hoặc không thuộc nhiệm vụ này",
        });
      }
    }

    let created: Record<string, unknown>;
    try {
      created = await this.db.missionAnalysisSnapshot.create({
        data: {
          missionId,
          kind: input.kind,
          requestId: input.requestId?.trim(),
          fingerprint: input.fingerprint.trim(),
          baselineSnapshotId: input.baselineSnapshotId,
          input: input.input as unknown as Prisma.InputJsonValue,
          provenance: input.provenance as unknown as Prisma.InputJsonValue,
          result: input.result as unknown as Prisma.InputJsonValue,
          assumptions: input.assumptions
            ? (input.assumptions as unknown as Prisma.InputJsonValue)
            : undefined,
          modelVersion: input.modelVersion.trim(),
          ruleVersion: input.ruleVersion.trim(),
          geoRegistryVersion: input.geoRegistryVersion?.trim(),
          routingGraphVersion: input.routingGraphVersion?.trim(),
          weatherSnapshotVersion: input.weatherSnapshotVersion?.trim(),
          actorId,
          computedAt: new Date(input.result.computedAt),
          expiresAt: input.expiresAt,
        },
      });
    } catch (error) {
      const retry = await this.findSnapshotAfterUniqueConflict(missionId, input.requestId, error);
      if (retry) {
        if (retry.fingerprint === input.fingerprint.trim()) return retry;
        throw new ConflictException({
          code: "VALIDATION_ERROR",
          message: "requestId đã được dùng cho một nội dung phân tích khác",
        });
      }
      throw error;
    }
    await this.audit.record({
      actorId,
      action: input.kind === "WHAT_IF" ? "MISSION_WHAT_IF_SAVED" : "MISSION_ANALYSIS_SAVED",
      entity: "MissionAnalysisSnapshot",
      entityId: String(created.id),
      warehouseId: (await this.getMissionWarehouseId(missionId)) ?? undefined,
      correlationId: input.requestId?.trim(),
      reason: "Lưu snapshot phân tích để truy vết phương án do con người xem xét",
      metadata: {
        kind: input.kind,
        fingerprint: input.fingerprint.trim(),
        modelVersion: input.modelVersion.trim(),
        ruleVersion: input.ruleVersion.trim(),
        hasUnresolvedAssumptions: Boolean(
          input.assumptions?.some((assumption) => assumption.resolution === "UNRESOLVED"),
        ),
      },
    });
    return created;
  }

  async listAnalysisSnapshots(
    missionId: string,
    actorId: string,
    scopeWarehouseId: string | null | undefined,
  ) {
    await this.assertMissionAccess(missionId, actorId, scopeWarehouseId);
    return this.db.missionAnalysisSnapshot.findMany({
      where: { missionId },
      orderBy: { computedAt: "desc" },
    });
  }

  async getAnalysisSnapshot(
    missionId: string,
    snapshotId: string,
    actorId: string,
    scopeWarehouseId: string | null | undefined,
  ) {
    await this.assertMissionAccess(missionId, actorId, scopeWarehouseId);
    const snapshot = await this.db.missionAnalysisSnapshot.findUnique({
      where: { id: snapshotId },
    });
    if (!snapshot || snapshot.missionId !== missionId) {
      throw new NotFoundException("Khong tim thay snapshot phan tich");
    }
    return snapshot;
  }

  private validateSnapshotInput(input: SaveAnalysisSnapshotInput): string[] {
    const errors: string[] = [];
    if (!isRequestId(input.requestId)) errors.push("requestId must contain 8..128 characters");
    if (!isNonEmptyWithin(input.fingerprint, 8, 256)) {
      errors.push("fingerprint must contain 8..256 characters");
    }
    if (!isNonEmptyWithin(input.modelVersion, 1, 120)) {
      errors.push("modelVersion must contain 1..120 characters");
    }
    if (!isNonEmptyWithin(input.ruleVersion, 1, 120)) {
      errors.push("ruleVersion must contain 1..120 characters");
    }
    if (input.kind === "WHAT_IF" && !isNonEmptyWithin(input.baselineSnapshotId, 1, 128)) {
      errors.push("baselineSnapshotId is required for WHAT_IF");
    }
    if (input.kind === "BASELINE" && input.baselineSnapshotId) {
      errors.push("baselineSnapshotId is only allowed for WHAT_IF");
    }
    return errors;
  }

  private async assertMissionAccess(
    missionId: string,
    actorId: string,
    scopeWarehouseId: string | null | undefined,
  ) {
    const mission = await this.db.mission.findUnique({
      where: { id: missionId },
      select: { id: true, warehouseId: true },
    });
    if (!mission) throw new NotFoundException("Không tìm thấy nhiệm vụ");
    await assertActorCanAccessWarehouse(
      this.prisma,
      actorId,
      scopeWarehouseId,
      mission.warehouseId,
    );
    return mission;
  }

  private async getMissionWarehouseId(missionId: string): Promise<string | null> {
    const mission = await this.db.mission.findUnique({
      where: { id: missionId },
      select: { warehouseId: true },
    });
    return mission?.warehouseId ?? null;
  }

  private async findFieldUpdateAfterUniqueConflict(
    missionId: string,
    actorId: string,
    requestId: string,
    error: unknown,
  ) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
      return null;
    }
    return this.db.missionFieldUpdate.findUnique({
      where: {
        missionId_actorId_requestId: {
          missionId,
          actorId,
          requestId: requestId.trim(),
        },
      },
    });
  }

  private async findSnapshotAfterUniqueConflict(
    missionId: string,
    requestId: string | undefined,
    error: unknown,
  ) {
    if (
      !requestId ||
      !(error instanceof Prisma.PrismaClientKnownRequestError) ||
      error.code !== "P2002"
    ) {
      return null;
    }
    return this.db.missionAnalysisSnapshot.findUnique({
      where: {
        missionId_requestId: {
          missionId,
          requestId: requestId.trim(),
        },
      },
    });
  }
}

function isRequestId(value: string | undefined): boolean {
  return value === undefined || isNonEmptyWithin(value, 8, 128);
}

function isNonEmptyWithin(value: string | undefined, min: number, max: number): boolean {
  const length = value?.trim().length ?? 0;
  return length >= min && length <= max;
}

function includesFolded(text: string, excerpt: string): boolean {
  const fold = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  return fold(text).includes(fold(excerpt));
}
