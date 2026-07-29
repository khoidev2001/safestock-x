import { BadRequestException, Injectable } from "@nestjs/common";
import {
  CoordinationAnalysis,
  ResolvedWhatIfAssumption,
  UnresolvedWhatIfAssumption,
  WhatIfAssumption,
  WhatIfDelta,
  WhatIfSimulationResult,
  validateCoordinationAnalysis,
} from "@safestock/shared-types";
import { createHash } from "crypto";
import { MissionCoordinationService } from "./mission-coordination.service";
import {
  parseRouteReferenceSnapshots,
  resolveGeoRouteReference,
} from "./geo-reference-registry";

export interface WhatIfInput {
  requestId: string;
  baselineSnapshotId: string;
  assumptionText: string;
}

/**
 * Deterministic natural-language resolver and snapshot-only simulator. Unknown
 * bridge/road/warehouse references remain unresolved; nothing is applied to
 * mission, inventory, routing data, or external communes.
 */
@Injectable()
export class WhatIfService {
  constructor(private readonly persistence: MissionCoordinationService) {}

  async simulate(
    missionId: string,
    actorId: string,
    scopeWarehouseId: string | null | undefined,
    input: WhatIfInput,
  ) {
    const baseline = await this.persistence.getAnalysisSnapshot(
      missionId,
      input.baselineSnapshotId,
      actorId,
      scopeWarehouseId,
    );
    if (baseline.kind !== "BASELINE" || !baseline.result || !isRecord(baseline.input)) {
      throw new BadRequestException({ code: "STALE_BASELINE", message: "Baseline khong hop le" });
    }
    const baselineAnalysis = baseline.result as CoordinationAnalysis;
    const baselineErrors = validateCoordinationAnalysis(baselineAnalysis);
    if (baselineErrors.length) {
      throw new BadRequestException({ code: "STALE_BASELINE", errors: baselineErrors });
    }
    const assumptions = resolveWhatIfAssumptions(
      input.assumptionText,
      baselineAnalysis,
      baseline.input,
    );
    const resolved = assumptions.filter(
      (assumption): assumption is ResolvedWhatIfAssumption => assumption.resolution === "RESOLVED",
    );
    const unresolved = assumptions.filter(
      (assumption): assumption is UnresolvedWhatIfAssumption => assumption.resolution === "UNRESOLVED",
    );
    const simulated = simulateAnalysis(baselineAnalysis, baseline.input, resolved, unresolved);
    const fingerprint = stableFingerprint({
      baselineFingerprint: baseline.fingerprint,
      assumptions,
      versions: baselineAnalysis.versions,
    });
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
    const simulation: WhatIfSimulationResult = {
      label: "MÔ PHỎNG",
      baselineFingerprint: baseline.fingerprint,
      assumptions: resolved,
      unresolvedAssumptions: unresolved,
      delta: simulated.delta,
      expiresAt: expiresAt.toISOString(),
    };
    const snapshot = await this.persistence.saveAnalysisSnapshot(
      missionId,
      actorId,
      scopeWarehouseId,
      {
        kind: "WHAT_IF",
        requestId: input.requestId,
        fingerprint,
        baselineSnapshotId: baseline.id,
        input: {
          baselineSnapshotId: baseline.id,
          baselineFingerprint: baseline.fingerprint,
          // Persist the computed delta with the immutable snapshot so an
          // ADMIN can reopen a preliminary simulation after refresh/relogin.
          simulation: { delta: simulation.delta, expiresAt: simulation.expiresAt },
        },
        provenance: { parser: "deterministic-whitelist.v1", sourceText: input.assumptionText.trim() },
        result: simulated.analysis,
        assumptions,
        modelVersion: baselineAnalysis.versions.model,
        ruleVersion: baselineAnalysis.versions.rules,
        geoRegistryVersion: baselineAnalysis.versions.geoRegistry,
        routingGraphVersion: baselineAnalysis.versions.routingGraph ?? undefined,
        weatherSnapshotVersion: baselineAnalysis.versions.weatherSnapshot ?? undefined,
        expiresAt,
      },
    );
    return { snapshot, simulation, analysis: simulated.analysis };
  }
}

export function resolveWhatIfAssumptions(
  sourceText: string,
  baseline: CoordinationAnalysis,
  baselineInput: Record<string, unknown> = {},
): WhatIfAssumption[] {
  const normalized = fold(sourceText);
  const assumptions: WhatIfAssumption[] = [];
  const people = numberAfter(normalized, /(?:neu |n[eế]u )?(?:co )?(\d{1,6}) nguoi/);
  if (people != null) {
    assumptions.push({ id: nextId(assumptions), resolution: "RESOLVED", kind: "AFFECTED_PEOPLE", sourceText, affectedPeople: people });
  }
  // A forecast horizon (for example "mưa 72 giờ") is not the duration of a
  // rescue mission. Duration must be stated as an operational assumption.
  const duration = explicitMissionDurationHours(normalized);
  if (duration != null) {
    assumptions.push({ id: nextId(assumptions), resolution: "RESOLVED", kind: "DURATION_HOURS", sourceText, durationHours: duration });
  }
  const reserve = numberAfter(normalized, /(\d{1,3})\s*%/);
  if (reserve != null && /(du tru|reserve)/.test(normalized)) {
    assumptions.push({ id: nextId(assumptions), resolution: "RESOLVED", kind: "RESERVE_PERCENT", sourceText, reservePercent: reserve });
  }
  const warehouses = new Map(
    baseline.coordination.allocations.map((allocation) => [fold(allocation.warehouseName), allocation.warehouseId]),
  );
  const requestedWarehouse = normalized.match(/(?:bo|loai) kho (.+)$/)?.[1]?.trim();
  if (requestedWarehouse) {
    const warehouseId = warehouses.get(requestedWarehouse);
    assumptions.push(
      warehouseId
        ? { id: nextId(assumptions), resolution: "RESOLVED", kind: "EXCLUDE_WAREHOUSE", sourceText, warehouseId }
        : unresolved(nextId(assumptions), sourceText, "UNKNOWN_REFERENCE"),
    );
  }
  const geoResolution = resolveGeoRouteReference(
    sourceText,
    parseRouteReferenceSnapshots(baselineInput.routeSnapshots),
  );
  if (geoResolution.status === "MATCHED") {
    for (const routeId of geoResolution.routeIds) {
      assumptions.push({
        id: nextId(assumptions),
        resolution: "RESOLVED",
        kind: "EXCLUDE_ROUTE",
        sourceText,
        routeId,
        matchedReferenceId: geoResolution.reference.id,
      });
    }
  } else if (geoResolution.status === "MISSING_TOPOLOGY") {
    assumptions.push(
      unresolved(
        nextId(assumptions),
        sourceText,
        "MISSING_TOPOLOGY",
        "EXCLUDE_ROUTE",
        [{ id: geoResolution.reference.id, label: geoResolution.reference.label }],
      ),
    );
  } else if (/(cau|duong|tuyen)/.test(normalized) && !requestedWarehouse) {
    assumptions.push(
      unresolved(nextId(assumptions), sourceText, "UNKNOWN_REFERENCE", "EXCLUDE_ROUTE"),
    );
  }
  if (/mua.*72 gio|72 gio.*mua/.test(normalized)) {
    const forecastSnapshotId = baseline.versions.weatherSnapshot;
    assumptions.push(
      forecastSnapshotId
        ? { id: nextId(assumptions), resolution: "RESOLVED", kind: "WEATHER_HORIZON", sourceText, horizonHours: 72, forecastSnapshotId }
        : unresolved(nextId(assumptions), sourceText, "MISSING_TOPOLOGY"),
    );
  }
  if (!assumptions.length) assumptions.push(unresolved(nextId(assumptions), sourceText, "UNSUPPORTED_ASSUMPTION"));
  return assumptions;
}

function simulateAnalysis(
  baseline: CoordinationAnalysis,
  baselineInput: Record<string, unknown>,
  assumptions: ResolvedWhatIfAssumption[],
  unresolvedAssumptions: UnresolvedWhatIfAssumption[],
) {
  const mission = isRecord(baselineInput.mission) ? baselineInput.mission : {};
  const basePeople = positiveNumber(mission.affectedPeople) ?? numericFact(baseline, "AFFECTED_PEOPLE") ?? 1;
  const baseDuration = positiveNumber(mission.durationHours) ?? 1;
  let multiplier = 1;
  const excludedWarehouses = new Set<string>();
  const excludedRoutes = new Set<string>();
  for (const assumption of assumptions) {
    if (assumption.kind === "AFFECTED_PEOPLE") multiplier *= assumption.affectedPeople / basePeople;
    if (assumption.kind === "DURATION_HOURS") multiplier *= assumption.durationHours / baseDuration;
    if (assumption.kind === "RESERVE_PERCENT") multiplier *= 1 + assumption.reservePercent / 100;
    if (assumption.kind === "EXCLUDE_WAREHOUSE") excludedWarehouses.add(assumption.warehouseId);
    if (assumption.kind === "EXCLUDE_ROUTE") excludedRoutes.add(assumption.routeId);
  }
  const requirements = baseline.requirements.items.map((item) => {
    const totalQuantity = Math.ceil(item.totalQuantity * multiplier);
    return { ...item, totalQuantity, baseQuantity: Math.ceil(item.baseQuantity * multiplier), reserveQuantity: Math.max(0, totalQuantity - Math.ceil(item.baseQuantity * multiplier)) };
  });
  const allocations = baseline.coordination.allocations.filter(
    (allocation) =>
      !excludedWarehouses.has(allocation.warehouseId) &&
      (allocation.routeId == null || !excludedRoutes.has(allocation.routeId)),
  );
  const baselineRequired = sum(baseline.requirements.items.map((item) => item.totalQuantity));
  const simulatedRequired = sum(requirements.map((item) => item.totalQuantity));
  const baselineAllocated = sum(baseline.coordination.allocations.map((item) => item.quantity));
  const simulatedAllocated = sum(allocations.map((item) => item.quantity));
  const fulfillment = simulatedRequired ? Math.round((simulatedAllocated / simulatedRequired) * 100) : null;
  const delta: WhatIfDelta = {
    metrics: [
      metric("requiredQuantity", "units", baselineRequired, simulatedRequired),
      metric("allocatedQuantity", "units", baselineAllocated, simulatedAllocated),
      metric("fulfillmentPercent", "%", baseline.coordination.fulfillmentPercent, fulfillment),
    ],
    warehousesAdded: [],
    warehousesRemoved: [...excludedWarehouses],
    routesChanged: assumptions.filter((item) => item.kind === "EXCLUDE_ROUTE").map((item) => item.routeId),
    warnings: [
      "MÔ PHỎNG: không thay đổi tồn kho, mission hoặc tuyến thực tế.",
      ...unresolvedAssumptions.map((item) => `Chưa xác định: ${item.sourceText}`),
    ],
  };
  const analysis: CoordinationAnalysis = {
    ...baseline,
    requirements: { ...baseline.requirements, items: requirements },
    coordination: { ...baseline.coordination, allocations, fulfillmentPercent: fulfillment },
    explanation: {
      summary: "MÔ PHỎNG — kết quả chỉ để ADMIN so sánh trước khi quyết định.",
      invalidatedBy: unresolvedAssumptions.map((item) => item.id),
    },
    computedAt: new Date().toISOString(),
  };
  const errors = validateCoordinationAnalysis(analysis);
  if (errors.length) throw new BadRequestException({ code: "VALIDATION_ERROR", errors });
  return { analysis, delta };
}

function unresolved(
  id: string,
  sourceText: string,
  reason: UnresolvedWhatIfAssumption["reason"],
  requestedKind: UnresolvedWhatIfAssumption["requestedKind"] = "UNSUPPORTED",
  candidates: UnresolvedWhatIfAssumption["candidates"] = [],
): UnresolvedWhatIfAssumption {
  return { id, resolution: "UNRESOLVED", requestedKind, sourceText, reason, candidates };
}
function metric(key: string, unit: string, baseline: number | null, simulated: number | null) {
  const change = baseline != null && simulated != null ? simulated - baseline : null;
  return { key, unit, baseline, simulated, change, direction: change == null ? "UNKNOWN" as const : change > 0 ? "INCREASED" as const : change < 0 ? "DECREASED" as const : "UNCHANGED" as const };
}
function fold(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/đ/g, "d").replace(/\s+/g, " ").trim(); }
function numberAfter(value: string, expression: RegExp) { const match = value.match(expression); const number = match?.[1] ? Number(match[1]) : null; return number != null && Number.isInteger(number) && number > 0 && number <= 100_000 ? number : null; }
function explicitMissionDurationHours(value: string) {
  const context = "(?:thoi gian|nhiem vu|cuu ho|tinh huong|ung pho)";
  return numberAfter(value, new RegExp(`${context}[^0-9]{0,48}(\\d{1,3}) gio`))
    ?? numberAfter(value, new RegExp(`(\\d{1,3}) gio[^a-z0-9]{0,12}${context}`));
}
function nextId(assumptions: WhatIfAssumption[]) { return `assumption-${assumptions.length + 1}`; }
function isRecord(value: unknown): value is Record<string, unknown> { return value != null && typeof value === "object" && !Array.isArray(value); }
function positiveNumber(value: unknown) { return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null; }
function numericFact(analysis: CoordinationAnalysis, key: string) { const fact = analysis.facts.find((item) => item.key === key && typeof item.value === "number"); return typeof fact?.value === "number" ? fact.value : null; }
function sum(values: number[]) { return values.reduce((total, value) => total + value, 0); }
function stableFingerprint(value: unknown) { return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`; }
