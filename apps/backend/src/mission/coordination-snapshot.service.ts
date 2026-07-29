import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import {
  CoordinationAnalysis,
  CoordinationFact,
  EXTERNAL_CONTACT_DISCLAIMER,
  ExternalContactSuggestion,
  SituationExtraction,
  validateCoordinationAnalysis,
  validateSituationExtraction,
} from "@safestock/shared-types";
import { createHash } from "crypto";
import {
  VERIFIED_WAREHOUSE_LOCATION_REGISTRY_VERSION,
} from "../../prisma/verified-warehouse-location";
import { getPublicCommuneContacts } from "../../prisma/verified-neighbor-contact";
import { LocalRoutingService } from "../geo/local-routing.service";
import { WeatherAlert, WeatherService } from "../insights/weather";
import { PrismaService } from "../prisma/prisma.service";
import { GEO_REFERENCE_REGISTRY_VERSION } from "./geo-reference-registry";

const COORDINATION_RULE_VERSION = "coordination-rules.v1";
const COORDINATION_MODEL_VERSION = "situation-extractor.v1";

interface AllocationRecord {
  warehouseId?: string;
  warehouseName?: string;
  qty?: number;
}

interface RequirementRecord {
  sku: string;
  itemName: string;
  unit: string;
  required: number;
  allocated: number;
  shortage: number;
  allocations: unknown;
}

interface MissionRecord {
  id: string;
  warehouseId: string;
  location: string | null;
  incidentType: string;
  affectedPeople: number;
  durationHours: number;
  fulfillment: number;
  incidentLat: number | null;
  incidentLng: number | null;
  reportText: string | null;
  warehouse: { id: string; name: string; lat: number | null; lng: number | null };
  requirements: RequirementRecord[];
}

interface SnapshotPersistence {
  mission: { findUnique(args: unknown): Promise<MissionRecord | null> };
  warehouse: {
    findMany(args: unknown): Promise<Array<{ id: string; name: string; lat: number | null; lng: number | null }>>;
  };
}

export interface CoordinationSnapshotResult {
  analysis: CoordinationAnalysis;
  snapshotInput: Record<string, unknown>;
  fingerprint: string;
}

/**
 * Read-only composition layer shared by the baseline and What-if flows. It
 * never creates, updates or deletes Mission, inventory, incident or map data.
 */
@Injectable()
export class CoordinationSnapshotService {
  private readonly db: SnapshotPersistence;

  constructor(
    prisma: PrismaService,
    private readonly weather: WeatherService,
    private readonly routing: LocalRoutingService,
  ) {
    this.db = prisma as unknown as SnapshotPersistence;
  }

  async compute(
    missionId: string,
    rawExtraction: unknown,
    options: { now?: Date } = {},
  ): Promise<CoordinationSnapshotResult> {
    const extractionErrors = validateSituationExtraction(rawExtraction);
    if (extractionErrors.length) {
      throw new BadRequestException({ code: "VALIDATION_ERROR", errors: extractionErrors });
    }
    const extraction = rawExtraction as SituationExtraction;
    const mission = await this.db.mission.findUnique({
      where: { id: missionId },
      include: { warehouse: true, requirements: true },
    });
    if (!mission) throw new NotFoundException("Khong tim thay nhiem vu");

    const now = options.now ?? new Date();
    const weather = await this.loadWeather(mission);
    const facts = this.composeFacts(mission, extraction, weather, now);
    const factIdsByKey = indexFactIds(facts);
    const readiness = this.computeReadiness(mission, extraction, facts);
    const allocationSnapshots = await this.computeAllocations(mission);
    const allocations = allocationSnapshots.map(
      ({ routeGeometry: _routeGeometry, roadRefs: _roadRefs, ...allocation }) => allocation,
    );
    const hasLocalShortage = mission.requirements.some((requirement) => requirement.shortage > 0);
    const externalContacts = hasLocalShortage
      ? await this.computeExternalContacts(mission)
      : [];
    const forecasts = this.buildForecasts(weather);
    const status = readiness.missingData.length > 0 ? "NEEDS_CONFIRMATION" : "PRELIMINARY";
    const analysis: CoordinationAnalysis = {
      schemaVersion: "coordination-analysis.v1",
      status,
      reception: {
        locationFactId: firstFactId(factIdsByKey, "LOCATION"),
        affectedPeopleFactId: firstFactId(factIdsByKey, "AFFECTED_PEOPLE"),
        incidentTypeFactId: firstFactId(factIdsByKey, "INCIDENT_TYPE"),
        weatherFactId: firstFactId(factIdsByKey, "WEATHER"),
        operationalStatus: status,
      },
      urgency: this.computeUrgency(facts, status),
      facts,
      missingData: readiness.missingData,
      conflicts: extraction.conflicts,
      requirements: readiness.requirements,
      coordination: {
        status: readiness.requirements.status === "COMPUTED" ? "COMPUTED" : "PENDING_DATA",
        allocations,
        fulfillmentPercent:
          readiness.requirements.status === "COMPUTED" ? mission.fulfillment : null,
        reason:
          readiness.requirements.status === "COMPUTED"
            ? null
            : "Can xac minh so nguoi va loai tinh huong truoc khi dung so lieu kho.",
        externalContacts,
      },
      forecasts,
      priorityQuestion:
        extraction.priorityQuestion ??
        (readiness.missingData[0]
          ? {
              factKey: readiness.missingData[0].key,
              question: readiness.missingData[0].question,
              expectedImpact: readiness.missingData[0].impact,
            }
          : null),
      explanation: {
        summary: this.buildSummary(mission, readiness.missingData, hasLocalShortage),
        invalidatedBy: readiness.missingData.map((item) => item.key),
      },
      adminControls: [
        "CONFIRM_FACTS",
        "REQUEST_MORE_INFORMATION",
        "EDIT_FACTS",
        "RUN_WHAT_IF",
        "APPROVE_DRAFT",
        "REJECT_DRAFT",
      ],
      computedAt: now.toISOString(),
      versions: {
        model: COORDINATION_MODEL_VERSION,
        rules: COORDINATION_RULE_VERSION,
        geoRegistry: GEO_REFERENCE_REGISTRY_VERSION,
        routingGraph: routeGraphVersion(allocations, externalContacts),
        weatherSnapshot: weather?.fetchedAt ?? null,
      },
    };
    const analysisErrors = validateCoordinationAnalysis(analysis);
    if (analysisErrors.length) {
      throw new BadRequestException({ code: "VALIDATION_ERROR", errors: analysisErrors });
    }
    const snapshotInput = {
      mission: {
        id: mission.id,
        warehouseId: mission.warehouseId,
        location: mission.location,
        incidentType: mission.incidentType,
        affectedPeople: mission.affectedPeople,
        durationHours: mission.durationHours,
        incidentLat: mission.incidentLat,
        incidentLng: mission.incidentLng,
        requirements: mission.requirements.map((item) => ({
          sku: item.sku,
          required: item.required,
          allocated: item.allocated,
          shortage: item.shortage,
          allocations: item.allocations,
        })),
      },
      extraction,
      versions: analysis.versions,
      warehouseLocationRegistryVersion: VERIFIED_WAREHOUSE_LOCATION_REGISTRY_VERSION,
      routeSnapshots: allocationSnapshots
        .filter((allocation) => allocation.routeId != null)
        .map((allocation) => ({
          routeId: allocation.routeId!,
          geometry: allocation.routeGeometry,
          // OSRM currently returns geometry but no road-name annotation. A
          // verified road reference may be added here only by a future
          // topology enrichment step; What-if must keep it unresolved today.
          roadRefs: allocation.roadRefs,
        })),
    };
    return { analysis, snapshotInput, fingerprint: stableFingerprint(snapshotInput) };
  }

  private async loadWeather(mission: MissionRecord): Promise<WeatherAlert | null> {
    if (mission.warehouse.lat == null || mission.warehouse.lng == null) return null;
    return this.weather.forecastRain(mission.warehouse.lat, mission.warehouse.lng);
  }

  private composeFacts(
    mission: MissionRecord,
    extraction: SituationExtraction,
    weather: WeatherAlert | null,
    now: Date,
  ): CoordinationFact[] {
    const facts: CoordinationFact[] = [...extraction.facts];
    if (
      mission.location &&
      mission.incidentLat != null &&
      mission.incidentLng != null &&
      !facts.some((fact) => fact.key === "LOCATION" && fact.provenance !== "MISSING")
    ) {
      facts.push({
        id: `system-location-${mission.id}`,
        key: "LOCATION",
        provenance: "VERIFIED",
        value: mission.location,
        source: {
          sourceType: "INCIDENT",
          sourceId: mission.id,
          excerpt: "ADMIN-selected mission location",
          capturedAt: now.toISOString(),
        },
        verifiedBy: {
          actorId: "SYSTEM",
          verifiedAt: now.toISOString(),
          method: "SYSTEM_RECORD",
        },
      });
    }
    if (weather) {
      facts.push({
        id: `system-weather-${mission.id}-${weather.fetchedAt}`,
        key: "WEATHER",
        provenance: "VERIFIED",
        value: {
          totalRainMm: weather.totalRainMm,
          periodHours: weather.periodHours,
          alert: weather.alert,
        },
        source: {
          sourceType: "SYSTEM_TOOL",
          sourceId: `open-meteo:${weather.fetchedAt}`,
          excerpt: "72h weather snapshot",
          capturedAt: weather.fetchedAt,
        },
        verifiedBy: {
          actorId: "SYSTEM",
          verifiedAt: now.toISOString(),
          method: "SYSTEM_RECORD",
        },
      });
    }
    return facts;
  }

  private computeReadiness(
    mission: MissionRecord,
    extraction: SituationExtraction,
    facts: CoordinationFact[],
  ) {
    const missingData = [...extraction.missingData];
    const hasAffectedPeople = hasKnownFact(facts, "AFFECTED_PEOPLE");
    const hasIncidentType = hasKnownFact(facts, "INCIDENT_TYPE");
    if (!hasAffectedPeople && !missingData.some((item) => item.key === "AFFECTED_PEOPLE")) {
      missingData.push({
        key: "AFFECTED_PEOPLE",
        question: "Can xac minh so nguoi bi anh huong?",
        impact: "Chua the tinh nhu cau vat tu khi chua co so nguoi.",
      });
    }
    if (!hasIncidentType && !missingData.some((item) => item.key === "INCIDENT_TYPE")) {
      missingData.push({
        key: "INCIDENT_TYPE",
        question: "Tinh huong chinh la gi?",
        impact: "Can xac minh loai tinh huong truoc khi ap dung dinh muc.",
      });
    }
    const canUsePlan = hasAffectedPeople && hasIncidentType && mission.requirements.length > 0;
    return {
      missingData,
      requirements: {
        status: canUsePlan ? ("COMPUTED" as const) : ("PENDING_DATA" as const),
        items: canUsePlan
          ? mission.requirements.map((requirement) => ({
              sku: requirement.sku,
              name: requirement.itemName,
              unit: requirement.unit,
              baseQuantity: requirement.required,
              reserveQuantity: 0,
              totalQuantity: requirement.required,
              basis: "Backend mission requirement snapshot",
              sourceFactIds: factIdsForKeys(facts, ["AFFECTED_PEOPLE", "INCIDENT_TYPE"]),
              ruleVersion: COORDINATION_RULE_VERSION,
            }))
          : [],
        reason: canUsePlan ? null : "Thieu fact co nguon de dung dinh muc kho.",
        ruleVersion: canUsePlan ? COORDINATION_RULE_VERSION : null,
      },
    };
  }

  private async computeAllocations(mission: MissionRecord) {
    const allocationRows = mission.requirements.flatMap((requirement) =>
      parseAllocations(requirement.allocations)
        .filter((allocation) => allocation.warehouseId && positiveInteger(allocation.qty))
        .map((allocation) => ({ requirement, allocation })),
    );
    const warehouseIds = [...new Set(allocationRows.map((row) => row.allocation.warehouseId!))];
    const warehouses = warehouseIds.length
      ? await this.db.warehouse.findMany({
          where: { id: { in: warehouseIds } },
          select: { id: true, name: true, lat: true, lng: true },
        })
      : [];
    const byWarehouseId = new Map(warehouses.map((warehouse) => [warehouse.id, warehouse]));
    return Promise.all(
      allocationRows.map(async ({ requirement, allocation }) => {
        const warehouse = byWarehouseId.get(allocation.warehouseId!);
        const route = await this.routeWarehouseToMission(warehouse, mission);
        const routeId =
          route.status === "AVAILABLE" ? `route:${mission.id}:${allocation.warehouseId}` : null;
        return {
          warehouseId: allocation.warehouseId!,
          warehouseName: warehouse?.name ?? allocation.warehouseName ?? allocation.warehouseId!,
          sku: requirement.sku,
          quantity: allocation.qty!,
          routeId,
          distanceKm: route.distanceKm,
          etaMinutes: route.etaMinutes,
          routeStatus: route.status,
          routeGeometry: route.status === "AVAILABLE" ? route.geometry : null,
          roadRefs: [] as string[],
        };
      }),
    );
  }

  private async computeExternalContacts(mission: MissionRecord): Promise<ExternalContactSuggestion[]> {
    const contacts = getPublicCommuneContacts().filter((contact) => contact.scope === "NEIGHBOR");
    return Promise.all(
      contacts.map(async (contact) => {
        const route = await this.routePointToMission(
          contact.referencePoint.lat,
          contact.referencePoint.lng,
          mission,
        );
        return {
          kind: "EXTERNAL_CONTACT",
          communeName: contact.communeName,
          referencePoint: contact.referencePoint,
          contactTitle: contact.contactTitle,
          phone: contact.phone,
          availability: "UNKNOWN",
          route:
            route.status === "AVAILABLE"
              ? {
                  status: "AVAILABLE",
                  routeId: `external:${mission.id}:${slug(contact.communeName)}`,
                  distanceKm: route.distanceKm!,
                  etaMinutes: route.etaMinutes!,
                  provenance: route.provenance,
                }
              : { status: "UNAVAILABLE", reason: route.reason },
          disclaimer: EXTERNAL_CONTACT_DISCLAIMER,
        };
      }),
    );
  }

  private async routeWarehouseToMission(
    warehouse: { lat: number | null; lng: number | null } | undefined,
    mission: MissionRecord,
  ) {
    if (!warehouse || warehouse.lat == null || warehouse.lng == null) {
      return { status: "UNKNOWN" as const, distanceKm: null, etaMinutes: null, provenance: null };
    }
    return this.routePointToMission(warehouse.lat, warehouse.lng, mission, true);
  }

  private async routePointToMission(
    lat: number,
    lng: number,
    mission: MissionRecord,
    internal = false,
  ): Promise<
    | {
        status: "AVAILABLE";
        distanceKm: number;
        etaMinutes: number;
        provenance: string;
        geometry: { type: "LineString"; coordinates: [number, number][] };
      }
    | {
        status: "UNKNOWN";
        distanceKm: null;
        etaMinutes: null;
        provenance?: null;
        reason: "ROUTING_UNAVAILABLE" | "NO_ROUTE" | "MISSING_COORDINATES";
      }
  > {
    if (mission.incidentLat == null || mission.incidentLng == null) {
      return {
        status: "UNKNOWN",
        distanceKm: null,
        etaMinutes: null,
        reason: "MISSING_COORDINATES",
      };
    }
    const route = await this.routing.route({ lat, lng }, { lat: mission.incidentLat, lng: mission.incidentLng });
    if (
      route.status !== "ROUTED" ||
      route.distanceKm == null ||
      route.etaMinutes == null ||
      route.geometry == null
    ) {
      return {
        status: "UNKNOWN",
        distanceKm: null,
        etaMinutes: null,
        reason: route.status === "ROUTE_NOT_FOUND" ? "NO_ROUTE" : "ROUTING_UNAVAILABLE",
      };
    }
    return {
      status: "AVAILABLE",
      distanceKm: route.distanceKm,
      etaMinutes: route.etaMinutes,
      provenance: `${internal ? "internal" : "external"}:local-osrm:${route.graphVersion ?? "unknown"}`,
      geometry: route.geometry,
    };
  }

  private buildForecasts(weather: WeatherAlert | null): CoordinationAnalysis["forecasts"] {
    const pending = [6, 12, 24].map((horizonHours) => ({
      horizonHours: horizonHours as 6 | 12 | 24,
      status: "PENDING_DATA" as const,
      risk: null,
      source: null,
      explanation: "Only the verified 72-hour weather snapshot is currently available.",
    }));
    return [
      ...pending,
      weather
        ? {
            horizonHours: 72 as const,
            status: "COMPUTED" as const,
            risk: null,
            source: `${weather.source}:${weather.fetchedAt}`,
            explanation: `72h rain ${weather.totalRainMm}mm; alert=${weather.alert}.`,
          }
        : {
            horizonHours: 72 as const,
            status: "UNAVAILABLE" as const,
            risk: null,
            source: null,
            explanation: "Weather source unavailable; no rainfall value was assumed.",
          },
    ];
  }

  private computeUrgency(facts: CoordinationFact[], status: CoordinationAnalysis["status"]) {
    const people = numericFactValue(facts, "AFFECTED_PEOPLE");
    const stranded = booleanFactValue(facts, "PEOPLE_STRANDED");
    const isolationRisk = booleanFactValue(facts, "ISOLATION_RISK");
    const basisFactIds = factIdsForKeys(facts, ["AFFECTED_PEOPLE", "PEOPLE_STRANDED", "ISOLATION_RISK"]);
    const level = stranded ? 5 : isolationRisk || (people ?? 0) >= 100 ? 4 : people ? 3 : null;
    return {
      level: level as 1 | 2 | 3 | 4 | 5 | null,
      label: level == null ? "Chua du du kien" : `Muc uu tien ${level}/5`,
      confidence: level == null ? null : stranded ? 0.9 : isolationRisk ? 0.7 : 0.6,
      status,
      basisFactIds,
      ruleVersion: level == null ? null : COORDINATION_RULE_VERSION,
    };
  }

  private buildSummary(
    mission: MissionRecord,
    missingData: SituationExtraction["missingData"],
    hasLocalShortage: boolean,
  ) {
    if (missingData.length) return "Can xac minh du lieu uu tien truoc khi dung phuong an kho.";
    if (hasLocalShortage) {
      return `Phuong an noi xa cua ${mission.warehouse.name} con thieu; chi de xuat diem lien he ngoai xa.`;
    }
    return `Phuong an noi xa cua ${mission.warehouse.name} da du du lieu de ADMIN xem xet.`;
  }
}

function parseAllocations(value: unknown): AllocationRecord[] {
  return Array.isArray(value)
    ? value.filter(isRecord).map((item) => ({
        warehouseId: asString(item.warehouseId),
        warehouseName: asString(item.warehouseName),
        qty: typeof item.qty === "number" ? item.qty : undefined,
      }))
    : [];
}

function positiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function hasKnownFact(facts: CoordinationFact[], key: string): boolean {
  return facts.some((fact) => fact.key === key && fact.provenance !== "MISSING");
}

function numericFactValue(facts: CoordinationFact[], key: string): number | null {
  const fact = facts.find((item) => item.key === key && typeof item.value === "number");
  return typeof fact?.value === "number" ? fact.value : null;
}

function booleanFactValue(facts: CoordinationFact[], key: string): boolean {
  const fact = facts.find((item) => item.key === key && typeof item.value === "boolean");
  return fact?.value === true;
}

function factIdsForKeys(facts: CoordinationFact[], keys: string[]): string[] {
  return facts.filter((fact) => keys.includes(fact.key) && fact.provenance !== "MISSING").map((fact) => fact.id);
}

function indexFactIds(facts: CoordinationFact[]) {
  const result = new Map<string, string[]>();
  for (const fact of facts) {
    if (fact.provenance === "MISSING") continue;
    result.set(fact.key, [...(result.get(fact.key) ?? []), fact.id]);
  }
  return result;
}

function firstFactId(index: Map<string, string[]>, key: string): string | null {
  return index.get(key)?.[0] ?? null;
}

function routeGraphVersion(
  allocations: CoordinationAnalysis["coordination"]["allocations"],
  contacts: ExternalContactSuggestion[],
): string | null {
  const route = contacts.find((contact) => contact.route.status === "AVAILABLE");
  if (route?.route.status === "AVAILABLE") return route.route.provenance;
  return allocations.some((allocation) => allocation.routeStatus === "AVAILABLE")
    ? "local-osrm"
    : null;
}

function stableFingerprint(value: unknown): string {
  return `sha256:${createHash("sha256").update(stableStringify(value)).digest("hex")}`;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function slug(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-");
}
