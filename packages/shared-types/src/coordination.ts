export const COORDINATION_ANALYSIS_SCHEMA_VERSION = "coordination-analysis.v1" as const;
export const SITUATION_EXTRACTION_SCHEMA_VERSION = "situation-extraction.v1" as const;
export const FIELD_UPDATE_INTENT_SCHEMA_VERSION = "field-update-intent.v1" as const;
export const EXTERNAL_CONTACT_DISCLAIMER =
  "Đề xuất liên hệ, chưa xác nhận có hàng" as const;

export type VerifiedLocationKind =
  | "COMMUNE_PEOPLES_COMMITTEE"
  | "HAMLET_CULTURAL_HOUSE";

export interface VerifiedWarehouseLocation<
  Kind extends VerifiedLocationKind = VerifiedLocationKind,
> {
  name: string;
  kind: Kind;
  address: string;
  plusCode: string;
  lat: number;
  lng: number;
  verificationStatus: "MAP_VERIFIED";
  verifiedAt: string;
  sourceUrl: string;
}

export interface PublicCommuneContact {
  communeName: string;
  scope: "HOME" | "NEIGHBOR";
  contactTitle: "Chủ tịch UBND xã";
  phone: string | null;
  availability: "LOCAL_INVENTORY" | "UNKNOWN";
  referencePoint: VerifiedWarehouseLocation<"COMMUNE_PEOPLES_COMMITTEE">;
}

export type CoordinationFactKey =
  | "LOCATION"
  | "AFFECTED_PEOPLE"
  | "HOUSEHOLDS"
  | "INCIDENT_TYPE"
  | "WEATHER"
  | "ISOLATION_RISK"
  | "PEOPLE_STRANDED"
  | "VULNERABLE_GROUP"
  | "ACCESS_CONDITION"
  | "DURATION_HOURS"
  | "OTHER";

export type CoordinationFactValue =
  | string
  | number
  | boolean
  | string[]
  | Record<string, string | number | boolean | null>;

export interface CoordinationFactSource {
  sourceType: "USER_REPORT" | "FIELD_UPDATE" | "INCIDENT" | "SYSTEM_TOOL";
  sourceId: string;
  excerpt: string | null;
  capturedAt: string | null;
}

interface CoordinationFactBase {
  id: string;
  key: CoordinationFactKey;
}

export interface ReportedCoordinationFact extends CoordinationFactBase {
  provenance: "REPORTED";
  value: CoordinationFactValue;
  qualifier: "EXACT" | "APPROXIMATE" | "POSSIBLE" | "UNSPECIFIED";
  source: CoordinationFactSource;
}

export interface VerifiedCoordinationFact extends CoordinationFactBase {
  provenance: "VERIFIED";
  value: CoordinationFactValue;
  source: CoordinationFactSource;
  verifiedBy: {
    actorId: string;
    verifiedAt: string;
    method: "ADMIN_CONFIRMATION" | "SYSTEM_RECORD" | "SENSOR_RULE";
  };
}

export interface InferredCoordinationFact extends CoordinationFactBase {
  provenance: "AI_INFERENCE";
  value: CoordinationFactValue;
  source: null;
  confidence: number;
  basisFactIds: string[];
  explanation: string;
}

export interface MissingCoordinationFact extends CoordinationFactBase {
  provenance: "MISSING";
  value: null;
  source: null;
  question: string;
  impact: string;
}

export type CoordinationFact =
  | ReportedCoordinationFact
  | VerifiedCoordinationFact
  | InferredCoordinationFact
  | MissingCoordinationFact;

export type CoordinationAnalysisStatus =
  | "PRELIMINARY"
  | "NEEDS_CONFIRMATION"
  | "VERIFIED";

export interface CoordinationRequirementRecommendation {
  sku: string;
  name: string;
  unit: string;
  baseQuantity: number;
  reserveQuantity: number;
  totalQuantity: number;
  basis: string;
  sourceFactIds: string[];
  ruleVersion: string;
}

export interface CoordinationAllocationRecommendation {
  warehouseId: string;
  warehouseName: string;
  sku: string;
  quantity: number;
  routeId: string | null;
  distanceKm: number | null;
  etaMinutes: number | null;
  routeStatus: "AVAILABLE" | "UNAVAILABLE" | "UNKNOWN";
}

export type ExternalReferenceRoute =
  | {
      status: "AVAILABLE";
      routeId: string;
      distanceKm: number;
      etaMinutes: number;
      provenance: string;
    }
  | {
      status: "UNAVAILABLE";
      reason: "ROUTING_UNAVAILABLE" | "NO_ROUTE" | "MISSING_COORDINATES";
    };

export interface ExternalContactSuggestion {
  kind: "EXTERNAL_CONTACT";
  communeName: string;
  referencePoint: VerifiedWarehouseLocation<"COMMUNE_PEOPLES_COMMITTEE">;
  contactTitle: "Chủ tịch UBND xã";
  phone: string | null;
  availability: "UNKNOWN";
  route: ExternalReferenceRoute;
  disclaimer: typeof EXTERNAL_CONTACT_DISCLAIMER;
}

export type AnalysisAdminControl =
  | "CONFIRM_FACTS"
  | "REQUEST_MORE_INFORMATION"
  | "RUN_WHAT_IF"
  | "EDIT_FACTS"
  | "APPROVE_DRAFT"
  | "REJECT_DRAFT";

export interface CoordinationAnalysis {
  schemaVersion: typeof COORDINATION_ANALYSIS_SCHEMA_VERSION;
  status: CoordinationAnalysisStatus;
  reception: {
    locationFactId: string | null;
    affectedPeopleFactId: string | null;
    incidentTypeFactId: string | null;
    weatherFactId: string | null;
    operationalStatus: CoordinationAnalysisStatus;
  };
  urgency: {
    level: 1 | 2 | 3 | 4 | 5 | null;
    label: string;
    confidence: number | null;
    status: CoordinationAnalysisStatus;
    basisFactIds: string[];
    ruleVersion: string | null;
  };
  facts: CoordinationFact[];
  missingData: Array<{
    key: CoordinationFactKey;
    question: string;
    impact: string;
  }>;
  conflicts: Array<{
    key: CoordinationFactKey;
    factIds: string[];
    question: string;
  }>;
  requirements: {
    status: "COMPUTED" | "PENDING_BACKEND" | "PENDING_DATA" | "UNAVAILABLE";
    items: CoordinationRequirementRecommendation[];
    reason: string | null;
    ruleVersion: string | null;
  };
  coordination: {
    status: "COMPUTED" | "PENDING_BACKEND" | "PENDING_DATA" | "UNAVAILABLE";
    allocations: CoordinationAllocationRecommendation[];
    fulfillmentPercent: number | null;
    reason: string | null;
    externalContacts: ExternalContactSuggestion[];
  };
  forecasts: Array<{
    horizonHours: 6 | 12 | 24 | 72;
    status: "COMPUTED" | "PENDING_DATA" | "UNAVAILABLE";
    risk: number | null;
    source: string | null;
    explanation: string;
  }>;
  priorityQuestion: {
    factKey: CoordinationFactKey;
    question: string;
    expectedImpact: string;
  } | null;
  explanation: {
    summary: string;
    invalidatedBy: string[];
  };
  adminControls: AnalysisAdminControl[];
  computedAt: string;
  versions: {
    model: string;
    rules: string;
    geoRegistry: string;
    routingGraph: string | null;
    weatherSnapshot: string | null;
  };
}

/** NLP-only output from ai-service before backend computes any operational data. */
export interface SituationExtraction {
  schemaVersion: typeof SITUATION_EXTRACTION_SCHEMA_VERSION;
  facts: Array<ReportedCoordinationFact | InferredCoordinationFact | MissingCoordinationFact>;
  missingData: Array<{
    key: CoordinationFactKey;
    question: string;
    impact: string;
  }>;
  conflicts: Array<{
    key: CoordinationFactKey;
    factIds: string[];
    question: string;
  }>;
  priorityQuestion: {
    factKey: CoordinationFactKey;
    question: string;
    expectedImpact: string;
  } | null;
}

export type WhatIfAssumptionKind =
  | "AFFECTED_PEOPLE"
  | "DURATION_HOURS"
  | "VULNERABLE_GROUP"
  | "RESERVE_PERCENT"
  | "EXCLUDE_WAREHOUSE"
  | "EXCLUDE_ROUTE"
  | "WEATHER_HORIZON";

interface ResolvedAssumptionBase {
  id: string;
  resolution: "RESOLVED";
  kind: WhatIfAssumptionKind;
  sourceText: string;
}

export type ResolvedWhatIfAssumption =
  | (ResolvedAssumptionBase & {
      kind: "AFFECTED_PEOPLE";
      affectedPeople: number;
    })
  | (ResolvedAssumptionBase & {
      kind: "DURATION_HOURS";
      durationHours: number;
    })
  | (ResolvedAssumptionBase & {
      kind: "VULNERABLE_GROUP";
      group: string;
      count: number;
    })
  | (ResolvedAssumptionBase & {
      kind: "RESERVE_PERCENT";
      reservePercent: number;
    })
  | (ResolvedAssumptionBase & {
      kind: "EXCLUDE_WAREHOUSE";
      warehouseId: string;
    })
  | (ResolvedAssumptionBase & {
      kind: "EXCLUDE_ROUTE";
      routeId: string;
      matchedReferenceId: string | null;
    })
  | (ResolvedAssumptionBase & {
      kind: "WEATHER_HORIZON";
      horizonHours: 6 | 12 | 24 | 72;
      forecastSnapshotId: string;
    });

export interface UnresolvedWhatIfAssumption {
  id: string;
  resolution: "UNRESOLVED";
  requestedKind: WhatIfAssumptionKind | "UNSUPPORTED";
  sourceText: string;
  reason:
    | "UNKNOWN_REFERENCE"
    | "AMBIGUOUS_REFERENCE"
    | "UNSUPPORTED_ASSUMPTION"
    | "MISSING_TOPOLOGY"
    | "INVALID_VALUE";
  candidates: Array<{
    id: string;
    label: string;
  }>;
}

export type WhatIfAssumption =
  | ResolvedWhatIfAssumption
  | UnresolvedWhatIfAssumption;

export interface WhatIfDelta {
  metrics: Array<{
    key: string;
    unit: string;
    baseline: number | null;
    simulated: number | null;
    change: number | null;
    direction: "INCREASED" | "DECREASED" | "UNCHANGED" | "UNKNOWN";
  }>;
  warehousesAdded: string[];
  warehousesRemoved: string[];
  routesChanged: string[];
  warnings: string[];
}

export interface WhatIfSimulationResult {
  label: "MÔ PHỎNG";
  baselineFingerprint: string;
  assumptions: ResolvedWhatIfAssumption[];
  unresolvedAssumptions: UnresolvedWhatIfAssumption[];
  delta: WhatIfDelta;
  expiresAt: string;
}

export type FieldUpdateIntentKind =
  | "ARRIVED"
  | "ACCESS_BLOCKED"
  | "ROUTE_HAZARD"
  | "AFFECTED_PEOPLE_CHANGED"
  | "VULNERABLE_GROUP_REPORTED"
  | "MORE_SUPPLIES_NEEDED"
  | "SUPPLIES_RECEIVED"
  | "SUPPLIES_DELIVERED"
  | "CANNOT_CONTINUE"
  | "SITUATION_STABLE"
  | "OTHER";

export interface FieldUpdateIntent {
  schemaVersion: typeof FIELD_UPDATE_INTENT_SCHEMA_VERSION;
  kind: FieldUpdateIntentKind;
  confidence: number;
  sourceExcerpt: string;
  requiresAdminVerification: boolean;
  facts: CoordinationFact[];
  resolvedReferenceIds: string[];
  unresolvedReferences: string[];
}

export interface MissionFieldUpdatePayload {
  requestId: string;
  inputMode: "TEXT" | "VOICE_TRANSCRIPT";
  confirmedText: string;
  confirmedByUser: true;
  clientCapturedAt?: string;
}

export type CoordinationErrorCode =
  | "VALIDATION_ERROR"
  | "UNRESOLVED_ASSUMPTION"
  | "STALE_BASELINE"
  | "AI_UNAVAILABLE"
  | "ROUTING_UNAVAILABLE"
  | "FORBIDDEN"
  | "NOT_FOUND";

const FACT_PROVENANCE = new Set([
  "REPORTED",
  "VERIFIED",
  "AI_INFERENCE",
  "MISSING",
]);
const ANALYSIS_STATUSES = new Set([
  "PRELIMINARY",
  "NEEDS_CONFIRMATION",
  "VERIFIED",
]);
const ASSUMPTION_KINDS = new Set<WhatIfAssumptionKind>([
  "AFFECTED_PEOPLE",
  "DURATION_HOURS",
  "VULNERABLE_GROUP",
  "RESERVE_PERCENT",
  "EXCLUDE_WAREHOUSE",
  "EXCLUDE_ROUTE",
  "WEATHER_HORIZON",
]);
const FIELD_UPDATE_INTENT_KINDS = new Set<FieldUpdateIntentKind>([
  "ARRIVED",
  "ACCESS_BLOCKED",
  "ROUTE_HAZARD",
  "AFFECTED_PEOPLE_CHANGED",
  "VULNERABLE_GROUP_REPORTED",
  "MORE_SUPPLIES_NEEDED",
  "SUPPLIES_RECEIVED",
  "SUPPLIES_DELIVERED",
  "CANNOT_CONTINUE",
  "SITUATION_STABLE",
  "OTHER",
]);
const UNRESOLVED_REASONS = new Set([
  "UNKNOWN_REFERENCE",
  "AMBIGUOUS_REFERENCE",
  "UNSUPPORTED_ASSUMPTION",
  "MISSING_TOPOLOGY",
  "INVALID_VALUE",
]);
const FORBIDDEN_COORDINATION_FIELDS = new Set([
  "assigneeId",
  "teamId",
  "imageUrl",
  "videoUrl",
  "gpsTrack",
  "gpsCoordinates",
  "externalInventory",
  "availableQuantity",
  "autoApprove",
  "autoDispatch",
]);

export function validateCoordinationAnalysis(input: unknown): string[] {
  const errors: string[] = [];
  validateNoForbiddenFields(input, "$", errors);
  const analysis = asRecord(input);
  if (!analysis) return ["analysis must be an object"];

  if (analysis.schemaVersion !== COORDINATION_ANALYSIS_SCHEMA_VERSION) {
    errors.push("schemaVersion is unsupported");
  }
  if (!ANALYSIS_STATUSES.has(String(analysis.status))) {
    errors.push("status is invalid");
  }
  for (const key of [
    "reception",
    "urgency",
    "requirements",
    "coordination",
    "explanation",
    "versions",
  ]) {
    if (!asRecord(analysis[key])) errors.push(`${key} must be an object`);
  }
  for (const key of [
    "facts",
    "missingData",
    "conflicts",
    "forecasts",
    "adminControls",
  ]) {
    if (!Array.isArray(analysis[key])) errors.push(`${key} must be an array`);
  }

  const facts = Array.isArray(analysis.facts) ? analysis.facts : [];
  const factIds = new Set<string>();
  const inferredBasis: Array<{ id: string; basisFactIds: unknown[] }> = [];
  facts.forEach((candidate, index) => {
    const path = `facts[${index}]`;
    const fact = asRecord(candidate);
    if (!fact) {
      errors.push(`${path} must be an object`);
      return;
    }
    const id = nonEmptyString(fact.id);
    if (!id) errors.push(`${path}.id is required`);
    else if (factIds.has(id)) errors.push(`${path}.id is duplicated`);
    else factIds.add(id);

    if (!nonEmptyString(fact.key)) errors.push(`${path}.key is required`);
    const provenance = String(fact.provenance);
    if (!FACT_PROVENANCE.has(provenance)) {
      errors.push(`${path}.provenance is invalid`);
      return;
    }

    if (provenance === "REPORTED") {
      if (fact.value == null) errors.push(`${path}.value is required`);
      validateFactSource(fact.source, `${path}.source`, errors);
      if (!new Set(["EXACT", "APPROXIMATE", "POSSIBLE", "UNSPECIFIED"]).has(
        String(fact.qualifier),
      )) {
        errors.push(`${path}.qualifier is invalid`);
      }
      validateReportedFactValue(String(fact.key), fact.value, path, errors);
    } else if (provenance === "VERIFIED") {
      if (fact.value == null) errors.push(`${path}.value is required`);
      validateFactSource(fact.source, `${path}.source`, errors);
      const verifiedBy = asRecord(fact.verifiedBy);
      if (!verifiedBy || !nonEmptyString(verifiedBy.actorId)) {
        errors.push(`${path}.verifiedBy is required`);
      }
    } else if (provenance === "AI_INFERENCE") {
      if (fact.value == null) errors.push(`${path}.value is required`);
      if (fact.source !== null) errors.push(`${path}.source must be null`);
      if (!isProbability(fact.confidence)) errors.push(`${path}.confidence must be 0..1`);
      if (!Array.isArray(fact.basisFactIds) || fact.basisFactIds.length === 0) {
        errors.push(`${path}.basisFactIds is required`);
      } else {
        inferredBasis.push({ id: id ?? path, basisFactIds: fact.basisFactIds });
      }
      if (!nonEmptyString(fact.explanation)) errors.push(`${path}.explanation is required`);
    } else {
      if (fact.value !== null) errors.push(`${path}.value must be null`);
      if (fact.source !== null) errors.push(`${path}.source must be null`);
      if (!nonEmptyString(fact.question)) errors.push(`${path}.question is required`);
      if (!nonEmptyString(fact.impact)) errors.push(`${path}.impact is required`);
    }
  });

  for (const inference of inferredBasis) {
    for (const basisId of inference.basisFactIds) {
      if (typeof basisId !== "string" || !factIds.has(basisId)) {
        errors.push(`${inference.id} references an unknown basis fact`);
      }
    }
  }

  const reception = asRecord(analysis.reception);
  if (reception) {
    for (const key of [
      "locationFactId",
      "affectedPeopleFactId",
      "incidentTypeFactId",
      "weatherFactId",
    ]) {
      const factId = reception[key];
      if (factId != null && (typeof factId !== "string" || !factIds.has(factId))) {
        errors.push(`reception.${key} references an unknown fact`);
      }
    }
    if (!ANALYSIS_STATUSES.has(String(reception.operationalStatus))) {
      errors.push("reception.operationalStatus is invalid");
    }
  }

  const urgency = asRecord(analysis.urgency);
  if (urgency) {
    if (
      urgency.level !== null &&
      (!Number.isInteger(urgency.level) || Number(urgency.level) < 1 || Number(urgency.level) > 5)
    ) {
      errors.push("urgency.level must be 1..5 or null");
    }
    if (urgency.confidence !== null && !isProbability(urgency.confidence)) {
      errors.push("urgency.confidence must be 0..1 or null");
    }
  }

  if (!validIsoDate(analysis.computedAt)) errors.push("computedAt must be an ISO date");
  return errors;
}

/**
 * Validates the AI-service's pre-compute extraction without allowing it to
 * claim a verified fact or to attach an operational recommendation.
 */
export function validateSituationExtraction(input: unknown): string[] {
  const extraction = asRecord(input);
  if (!extraction) return ["situation extraction must be an object"];
  const errors: string[] = [];
  validateNoForbiddenFields(input, "$", errors);
  const allowedKeys = new Set([
    "schemaVersion",
    "facts",
    "missingData",
    "conflicts",
    "priorityQuestion",
  ]);
  for (const key of Object.keys(extraction)) {
    if (!allowedKeys.has(key)) errors.push(`situation extraction contains unsupported field ${key}`);
  }
  if (extraction.schemaVersion !== SITUATION_EXTRACTION_SCHEMA_VERSION) {
    errors.push("situation extraction schemaVersion is unsupported");
  }
  if (!Array.isArray(extraction.facts)) errors.push("facts must be an array");
  if (!Array.isArray(extraction.missingData)) errors.push("missingData must be an array");
  if (!Array.isArray(extraction.conflicts)) errors.push("conflicts must be an array");
  if (extraction.priorityQuestion !== null && !asRecord(extraction.priorityQuestion)) {
    errors.push("priorityQuestion must be an object or null");
  }

  const facts = Array.isArray(extraction.facts) ? extraction.facts : [];
  if (facts.length === 0) errors.push("facts must not be empty");
  if (facts.some((fact) => asRecord(fact)?.provenance === "VERIFIED")) {
    errors.push("AI extraction cannot claim VERIFIED facts");
  }
  if (
    facts.some((fact) => {
      const source = asRecord(asRecord(fact)?.source);
      return source && !["USER_REPORT", "FIELD_UPDATE"].includes(String(source.sourceType));
    })
  ) {
    errors.push("AI extraction reported sourceType is invalid");
  }

  // Reuse the stricter fact/reference validation instead of maintaining two
  // subtly different provenance parsers.
  const factValidation = validateCoordinationAnalysis({
    schemaVersion: COORDINATION_ANALYSIS_SCHEMA_VERSION,
    status: "NEEDS_CONFIRMATION",
    reception: {
      locationFactId: null,
      affectedPeopleFactId: null,
      incidentTypeFactId: null,
      weatherFactId: null,
      operationalStatus: "NEEDS_CONFIRMATION",
    },
    urgency: {
      level: null,
      label: "Chờ dữ kiện",
      confidence: null,
      status: "NEEDS_CONFIRMATION",
      basisFactIds: [],
      ruleVersion: null,
    },
    facts,
    missingData: Array.isArray(extraction.missingData) ? extraction.missingData : [],
    conflicts: Array.isArray(extraction.conflicts) ? extraction.conflicts : [],
    requirements: { status: "PENDING_DATA", items: [], reason: null, ruleVersion: null },
    coordination: {
      status: "PENDING_DATA",
      allocations: [],
      fulfillmentPercent: null,
      reason: null,
      externalContacts: [],
    },
    forecasts: [],
    priorityQuestion: extraction.priorityQuestion ?? null,
    explanation: { summary: "NLP extraction", invalidatedBy: [] },
    adminControls: [],
    computedAt: new Date(0).toISOString(),
    versions: {
      model: "situation-extractor",
      rules: "coordination-rules",
      geoRegistry: "unresolved",
      routingGraph: null,
      weatherSnapshot: null,
    },
  });
  return [...errors, ...factValidation];
}

export function validateWhatIfAssumptions(input: unknown): string[] {
  const errors: string[] = [];
  validateNoForbiddenFields(input, "$", errors);
  if (!Array.isArray(input)) return ["assumptions must be an array"];

  input.forEach((candidate, index) => {
    const path = `assumptions[${index}]`;
    const assumption = asRecord(candidate);
    if (!assumption) {
      errors.push(`${path} must be an object`);
      return;
    }
    if (!nonEmptyString(assumption.id)) errors.push(`${path}.id is required`);
    if (!nonEmptyString(assumption.sourceText)) errors.push(`${path}.sourceText is required`);

    if (assumption.resolution === "UNRESOLVED") {
      if (
        assumption.requestedKind !== "UNSUPPORTED" &&
        !ASSUMPTION_KINDS.has(assumption.requestedKind as WhatIfAssumptionKind)
      ) {
        errors.push(`${path}.requestedKind is invalid`);
      }
      if (!UNRESOLVED_REASONS.has(String(assumption.reason))) {
        errors.push(`${path}.reason is invalid`);
      }
      if (!Array.isArray(assumption.candidates)) errors.push(`${path}.candidates is required`);
      return;
    }

    if (assumption.resolution !== "RESOLVED") {
      errors.push(`${path}.resolution is invalid`);
      return;
    }
    const kind = assumption.kind as WhatIfAssumptionKind;
    if (!ASSUMPTION_KINDS.has(kind)) {
      errors.push(`${path}.kind is invalid`);
      return;
    }
    if (kind === "AFFECTED_PEOPLE") {
      validateIntegerRange(assumption.affectedPeople, 1, 100_000, `${path}.affectedPeople`, errors);
    } else if (kind === "DURATION_HOURS") {
      validateIntegerRange(assumption.durationHours, 1, 720, `${path}.durationHours`, errors);
    } else if (kind === "VULNERABLE_GROUP") {
      if (!nonEmptyString(assumption.group)) errors.push(`${path}.group is required`);
      validateIntegerRange(assumption.count, 0, 100_000, `${path}.count`, errors);
    } else if (kind === "RESERVE_PERCENT") {
      validateNumberRange(assumption.reservePercent, 0, 100, `${path}.reservePercent`, errors);
    } else if (kind === "EXCLUDE_WAREHOUSE") {
      if (!nonEmptyString(assumption.warehouseId)) errors.push(`${path}.warehouseId is required`);
    } else if (kind === "EXCLUDE_ROUTE") {
      if (!nonEmptyString(assumption.routeId)) errors.push(`${path}.routeId is required`);
    } else {
      if (![6, 12, 24, 72].includes(Number(assumption.horizonHours))) {
        errors.push(`${path}.horizonHours is invalid`);
      }
      if (!nonEmptyString(assumption.forecastSnapshotId)) {
        errors.push(`${path}.forecastSnapshotId is required`);
      }
    }
  });
  return errors;
}

export function validateFieldUpdatePayload(input: unknown): string[] {
  const errors: string[] = [];
  validateNoForbiddenFields(input, "$", errors);
  const payload = asRecord(input);
  if (!payload) return ["field update must be an object"];

  const allowedKeys = new Set([
    "requestId",
    "inputMode",
    "confirmedText",
    "confirmedByUser",
    "clientCapturedAt",
  ]);
  for (const key of Object.keys(payload)) {
    if (!allowedKeys.has(key)) errors.push(`field update contains unsupported field ${key}`);
  }
  const requestId = nonEmptyString(payload.requestId);
  if (!requestId || requestId.length < 8 || requestId.length > 128) {
    errors.push("requestId must contain 8..128 characters");
  }
  if (!new Set(["TEXT", "VOICE_TRANSCRIPT"]).has(String(payload.inputMode))) {
    errors.push("inputMode is invalid");
  }
  const text = nonEmptyString(payload.confirmedText);
  if (!text || text.length > 4_000) {
    errors.push("confirmedText must contain 1..4000 characters");
  }
  if (payload.confirmedByUser !== true) {
    errors.push("confirmedByUser must be true");
  }
  if (payload.clientCapturedAt != null && !validIsoDate(payload.clientCapturedAt)) {
    errors.push("clientCapturedAt must be an ISO date");
  }
  return errors;
}

/**
 * Validates the AI field-assistant result before it is stored. The output is
 * evidence-only: it cannot claim verification, resolve a free-text route, or
 * initiate any operational action.
 */
export function validateFieldUpdateIntent(input: unknown): string[] {
  const errors: string[] = [];
  validateNoForbiddenFields(input, "$", errors);
  const intent = asRecord(input);
  if (!intent) return ["field update intent must be an object"];

  const allowedKeys = new Set([
    "schemaVersion",
    "kind",
    "confidence",
    "sourceExcerpt",
    "requiresAdminVerification",
    "facts",
    "resolvedReferenceIds",
    "unresolvedReferences",
  ]);
  for (const key of Object.keys(intent)) {
    if (!allowedKeys.has(key)) errors.push(`field update intent contains unsupported field ${key}`);
  }
  if (intent.schemaVersion !== FIELD_UPDATE_INTENT_SCHEMA_VERSION) {
    errors.push("field update intent schemaVersion is unsupported");
  }
  if (!FIELD_UPDATE_INTENT_KINDS.has(intent.kind as FieldUpdateIntentKind)) {
    errors.push("field update intent kind is invalid");
  }
  if (!isProbability(intent.confidence)) errors.push("field update intent confidence must be 0..1");
  const sourceExcerpt = nonEmptyString(intent.sourceExcerpt);
  if (!sourceExcerpt || sourceExcerpt.length > 1_000) {
    errors.push("field update intent sourceExcerpt must contain 1..1000 characters");
  }
  if (intent.requiresAdminVerification !== true) {
    errors.push("field update intent requiresAdminVerification must be true");
  }
  if (!Array.isArray(intent.resolvedReferenceIds) || intent.resolvedReferenceIds.length !== 0) {
    errors.push("field update intent resolvedReferenceIds must be empty");
  }
  if (!Array.isArray(intent.unresolvedReferences) || intent.unresolvedReferences.length > 12) {
    errors.push("field update intent unresolvedReferences is invalid");
  } else {
    intent.unresolvedReferences.forEach((reference, index) => {
      const text = nonEmptyString(reference);
      if (!text || text.length > 500) {
        errors.push(`field update intent unresolvedReferences[${index}] must contain 1..500 characters`);
      }
    });
  }

  const factValidation = validateSituationExtraction({
    schemaVersion: SITUATION_EXTRACTION_SCHEMA_VERSION,
    facts: Array.isArray(intent.facts) ? intent.facts : [],
    missingData: [],
    conflicts: [],
    priorityQuestion: null,
  });
  errors.push(...factValidation);
  const facts = Array.isArray(intent.facts) ? intent.facts : [];
  if (
    facts.some((fact) => {
      const source = asRecord(asRecord(fact)?.source);
      return source?.sourceType === "FIELD_UPDATE" ? false : source != null;
    })
  ) {
    errors.push("field update intent facts must use FIELD_UPDATE sources");
  }
  return errors;
}

function validateReportedFactValue(
  key: string,
  value: unknown,
  path: string,
  errors: string[],
) {
  if (key === "AFFECTED_PEOPLE" || key === "HOUSEHOLDS") {
    validateIntegerRange(value, 0, 100_000, `${path}.${key}`, errors);
    return;
  }
  if (key === "DURATION_HOURS") {
    validateIntegerRange(value, 0, 720, `${path}.${key}`, errors);
    return;
  }
  if (key === "ISOLATION_RISK" || key === "PEOPLE_STRANDED") {
    if (typeof value !== "boolean") errors.push(`${path}.${key} must be boolean`);
    return;
  }
  if (key === "INCIDENT_TYPE") {
    if (!new Set(["FLOOD", "STORM", "LANDSLIDE", "FIRE", "ISOLATION", "OTHER"]).has(String(value))) {
      errors.push(`${path}.INCIDENT_TYPE is invalid`);
    }
  }
}

function validateFactSource(input: unknown, path: string, errors: string[]) {
  const source = asRecord(input);
  if (!source) {
    errors.push(`${path} must be an object`);
    return;
  }
  if (!nonEmptyString(source.sourceType)) errors.push(`${path}.sourceType is required`);
  if (!nonEmptyString(source.sourceId)) errors.push(`${path}.sourceId is required`);
  if (!nonEmptyString(source.excerpt)) errors.push(`${path}.excerpt is required`);
  if (source.capturedAt != null && !validIsoDate(source.capturedAt)) {
    errors.push(`${path}.capturedAt must be an ISO date or null`);
  }
}

function validateNoForbiddenFields(
  input: unknown,
  path: string,
  errors: string[],
  visited = new WeakSet<object>(),
) {
  if (input == null || typeof input !== "object") return;
  if (visited.has(input)) return;
  visited.add(input);
  if (Array.isArray(input)) {
    input.forEach((item, index) =>
      validateNoForbiddenFields(item, `${path}[${index}]`, errors, visited),
    );
    return;
  }
  for (const [key, value] of Object.entries(input)) {
    if (FORBIDDEN_COORDINATION_FIELDS.has(key)) {
      errors.push(`${path}.${key} is forbidden`);
    }
    validateNoForbiddenFields(value, `${path}.${key}`, errors, visited);
  }
}

function asRecord(input: unknown): Record<string, unknown> | null {
  return input != null && typeof input === "object" && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : null;
}

function nonEmptyString(input: unknown): string | null {
  return typeof input === "string" && input.trim().length > 0 ? input.trim() : null;
}

function isProbability(input: unknown): boolean {
  return typeof input === "number" && Number.isFinite(input) && input >= 0 && input <= 1;
}

function validIsoDate(input: unknown): boolean {
  return typeof input === "string" && !Number.isNaN(Date.parse(input));
}

function validateIntegerRange(
  input: unknown,
  minimum: number,
  maximum: number,
  path: string,
  errors: string[],
) {
  if (!Number.isInteger(input) || Number(input) < minimum || Number(input) > maximum) {
    errors.push(`${path} must be an integer in ${minimum}..${maximum}`);
  }
}

function validateNumberRange(
  input: unknown,
  minimum: number,
  maximum: number,
  path: string,
  errors: string[],
) {
  if (
    typeof input !== "number" ||
    !Number.isFinite(input) ||
    input < minimum ||
    input > maximum
  ) {
    errors.push(`${path} must be in ${minimum}..${maximum}`);
  }
}
