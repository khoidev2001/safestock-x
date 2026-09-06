import { Injectable, Logger } from "@nestjs/common";
import {
  FIELD_UPDATE_INTENT_SCHEMA_VERSION,
  FieldUpdateIntent,
  MissionFieldUpdatePayload,
  validateFieldUpdateIntent,
} from "@safestock/shared-types";
import { AiClientService } from "../ai/ai-client.service";
import { NotificationService } from "../notification/notification.service";
import { MissionCoordinationService } from "./mission-coordination.service";
import { WhatIfService } from "./what-if.service";

type StoredFieldUpdate = {
  id: string;
  confirmedText: string;
  inputMode?: string;
  clientCapturedAt?: Date | string | null;
  structuredIntent?: unknown;
};

/**
 * Orchestrates the field assistant after evidence is committed. Its only
 * side effects are a non-operational label and an ADMIN notification; it
 * never changes the mission, inventory, route or dispatch workflow.
 */
@Injectable()
export class FieldUpdateAssistantService {
  private readonly log = new Logger(FieldUpdateAssistantService.name);

  constructor(
    private readonly coordination: MissionCoordinationService,
    private readonly ai: AiClientService,
    private readonly notifications: NotificationService,
    private readonly whatIf: WhatIfService,
  ) {}

  async submit(
    missionId: string,
    actorId: string,
    scopeWarehouseId: string | null | undefined,
    payload: MissionFieldUpdatePayload,
  ) {
    const recorded = (await this.coordination.recordFieldUpdate(
      missionId,
      actorId,
      scopeWarehouseId,
      payload,
    )) as StoredFieldUpdate;
    if (!recorded.id || !recorded.confirmedText) {
      return recorded;
    }
    if (
      isRecord(recorded.structuredIntent) &&
      validateFieldUpdateIntent(recorded.structuredIntent).length === 0
    ) {
      await this.notifyAdmin(
        missionId,
        recorded.id,
        recorded.structuredIntent as unknown as FieldUpdateIntent,
        { status: "RETRY" },
      );
      return recorded;
    }

    let intent: FieldUpdateIntent;
    let source: "AI_SERVICE" | "BACKEND_FALLBACK" = "AI_SERVICE";
    try {
      intent = await this.ai.analyzeFieldUpdateIntent({
        confirmedText: recorded.confirmedText,
        sourceId: recorded.id,
        capturedAt: iso(recorded.clientCapturedAt),
      });
    } catch (error) {
      source = "BACKEND_FALLBACK";
      this.log.warn(
        `AI intent unavailable for field update ${recorded.id}: ${safeErrorClass(error)}`,
      );
      intent = fallbackIntent(recorded);
    }
    const preliminarySimulation = await this.runPreliminarySimulation(
      missionId,
      actorId,
      scopeWarehouseId,
      recorded,
      intent,
    );

    try {
      const saved = await this.coordination.saveFieldUpdateIntent(
        missionId,
        actorId,
        scopeWarehouseId,
        recorded,
        intent,
        {
          schemaVersion: FIELD_UPDATE_INTENT_SCHEMA_VERSION,
          source,
          extractedAt: new Date().toISOString(),
          inputMode: recorded.inputMode ?? "TEXT",
          operationalMutation: false,
          preliminarySimulation,
        },
      );
      await this.notifyAdmin(missionId, recorded.id, intent, preliminarySimulation);
      return saved;
    } catch (error) {
      // Evidence was already committed. Enrichment failure must not make the
      // mobile user retry a mutation or imply that the report was lost.
      this.log.warn(`Cannot enrich field update ${recorded.id}: ${safeErrorClass(error)}`);
      return recorded;
    }
  }

  private async notifyAdmin(
    missionId: string,
    fieldUpdateId: string,
    intent: FieldUpdateIntent,
    preliminarySimulation: { status: string },
  ) {
    try {
      await this.notifications.create({
        recipientRole: "ADMIN",
        kind: "FIELD_UPDATE_REPORTED" as never,
        title: "Cập nhật mới từ Đội cứu hộ",
        body: notificationBody(intent, preliminarySimulation),
        missionId,
        fieldUpdateId,
      });
    } catch (error) {
      this.log.warn(
        `Cannot notify ADMIN about field update ${fieldUpdateId}: ${safeErrorClass(error)}`,
      );
    }
  }

  private async runPreliminarySimulation(
    missionId: string,
    actorId: string,
    scopeWarehouseId: string | null | undefined,
    update: StoredFieldUpdate,
    intent: FieldUpdateIntent,
  ) {
    if (!needsPreliminarySimulation(intent.kind)) {
      return { status: "NOT_APPLICABLE" as const };
    }
    try {
      const snapshots = await this.coordination.listAnalysisSnapshots(
        missionId,
        actorId,
        scopeWarehouseId,
      );
      const baseline = snapshots.find((snapshot) => snapshot["kind"] === "BASELINE");
      if (!baseline || typeof baseline["id"] !== "string") {
        return { status: "BASELINE_MISSING" as const };
      }
      const result = await this.whatIf.simulate(missionId, actorId, scopeWarehouseId, {
        requestId: `field-what-if-${update.id}`,
        baselineSnapshotId: baseline["id"],
        assumptionText: update.confirmedText,
      });
      const simulation = result.simulation as { unresolvedAssumptions?: unknown[] } | undefined;
      return {
        status: "CREATED" as const,
        snapshotId: String((result.snapshot as { id: string }).id),
        expiresAt: (result.snapshot as { expiresAt?: string | null }).expiresAt ?? null,
        unresolvedAssumptionCount: simulation?.unresolvedAssumptions?.length ?? 0,
      };
    } catch (error) {
      this.log.warn(
        `Cannot run preliminary What-if for field update ${update.id}: ${safeErrorClass(error)}`,
      );
      return { status: "FAILED" as const };
    }
  }
}

function fallbackIntent(update: StoredFieldUpdate): FieldUpdateIntent {
  const excerpt = update.confirmedText.trim().slice(0, 500);
  const folded = fold(excerpt);
  const kind = classify(folded);
  const unresolvedReferences = /\b(cau|duong|tuyen)\b/.test(folded) ? [excerpt] : [];
  return {
    schemaVersion: FIELD_UPDATE_INTENT_SCHEMA_VERSION,
    kind,
    confidence: kind === "OTHER" ? 0.35 : 0.8,
    sourceExcerpt: excerpt,
    requiresAdminVerification: true,
    facts: [
      {
        id: "F1",
        key: "OTHER",
        provenance: "REPORTED",
        value: excerpt,
        qualifier: "EXACT",
        source: {
          sourceType: "FIELD_UPDATE",
          sourceId: update.id,
          excerpt,
          capturedAt: iso(update.clientCapturedAt),
        },
      },
    ],
    resolvedReferenceIds: [],
    unresolvedReferences,
  };
}

function classify(text: string): FieldUpdateIntent["kind"] {
  if (
    /\b(cau|duong|tuyen)\b/.test(text) &&
    /khong qua duoc|sat lo|ngap|nguy hiem|bi chan/.test(text)
  )
    return "ROUTE_HAZARD";
  if (/khong tiep can|bi chan|khong vao duoc/.test(text)) return "ACCESS_BLOCKED";
  if (/khong the tiep tuc|khong tiep tuc duoc|phai dung/.test(text)) return "CANNOT_CONTINUE";
  if (/da den|da toi/.test(text)) return "ARRIVED";
  if (/so nguoi.*(?:tang|giam|doi)|(?:tang|giam|doi).*so nguoi/.test(text))
    return "AFFECTED_PEOPLE_CHANGED";
  if (/tre em|nguoi gia|nguoi benh|phu nu mang thai/.test(text)) return "VULNERABLE_GROUP_REPORTED";
  if (/(can them|bo sung|thieu)/.test(text) && /(vat tu|nuoc|ao phao|thuoc)/.test(text))
    return "MORE_SUPPLIES_NEEDED";
  if (/da nhan/.test(text) && /(vat tu|nuoc|ao phao|thuoc)/.test(text)) return "SUPPLIES_RECEIVED";
  if (/da giao/.test(text) && /(vat tu|nuoc|ao phao|thuoc)/.test(text)) return "SUPPLIES_DELIVERED";
  if (/on dinh|an toan|da on/.test(text)) return "SITUATION_STABLE";
  return "OTHER";
}

function notificationBody(intent: FieldUpdateIntent, preliminarySimulation: { status: string }) {
  const unresolved = intent.unresolvedReferences.length ? " Có địa danh/tuyến chưa xác minh." : "";
  const simulation =
    preliminarySimulation.status === "CREATED"
      ? " Đã có What-if sơ bộ để đối chiếu; không có thay đổi vận hành."
      : preliminarySimulation.status === "BASELINE_MISSING"
        ? " Chưa có baseline nên chưa thể tạo What-if sơ bộ."
        : "";
  return `${intent.sourceExcerpt.slice(0, 180)} — AI ghi nhận: ${intent.kind}. ADMIN cần xác minh trước khi điều chỉnh phương án.${unresolved}${simulation}`;
}

function needsPreliminarySimulation(kind: FieldUpdateIntent["kind"]): boolean {
  return ["ACCESS_BLOCKED", "ROUTE_HAZARD", "AFFECTED_PEOPLE_CHANGED", "CANNOT_CONTINUE"].includes(
    kind,
  );
}

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function fold(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function safeErrorClass(error: unknown): string {
  return error != null && typeof error === "object" && "name" in error
    ? String(error.name).slice(0, 80)
    : "UnknownError";
}
