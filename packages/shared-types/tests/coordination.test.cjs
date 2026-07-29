const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const {
  COORDINATION_ANALYSIS_SCHEMA_VERSION,
  EXTERNAL_CONTACT_DISCLAIMER,
  FIELD_UPDATE_INTENT_SCHEMA_VERSION,
  SITUATION_EXTRACTION_SCHEMA_VERSION,
  USER_ROLE_LABELS,
  UserRole,
  validateCoordinationAnalysis,
  validateFieldUpdatePayload,
  validateFieldUpdateIntent,
  validateSituationExtraction,
  validateWhatIfAssumptions,
} = require("../dist");

const fixture = require(path.resolve(
  __dirname,
  "../../../apps/ai-service/tests/fixtures/phuoc-loc-analysis.json",
));

test("uses one user-facing label for the RESCUE technical role", () => {
  assert.equal(USER_ROLE_LABELS[UserRole.RESCUE], "Lực lượng hiện trường");
});

test("accepts the provenance-aware Phước Lộc golden analysis", () => {
  assert.equal(fixture.schemaVersion, COORDINATION_ANALYSIS_SCHEMA_VERSION);
  assert.deepEqual(validateCoordinationAnalysis(fixture), []);
});

test("does not upgrade isolation risk into a stranded-people fact", () => {
  const isolationRisk = fixture.facts.find((fact) => fact.key === "ISOLATION_RISK");
  const strandedPeople = fixture.facts.find((fact) => fact.key === "PEOPLE_STRANDED");

  assert.equal(isolationRisk.provenance, "AI_INFERENCE");
  assert.equal(isolationRisk.value, true);
  assert.equal(strandedPeople.provenance, "MISSING");
  assert.equal(strandedPeople.value, null);
});

test("keeps unresolved What-if input in a separate branch", () => {
  const assumptions = [
    {
      id: "assumption-1",
      resolution: "RESOLVED",
      kind: "AFFECTED_PEOPLE",
      sourceText: "nếu có 150 người",
      affectedPeople: 150,
    },
    {
      id: "assumption-2",
      resolution: "UNRESOLVED",
      requestedKind: "EXCLUDE_ROUTE",
      sourceText: "cầu sắt La Hai bị ngập",
      reason: "AMBIGUOUS_REFERENCE",
      candidates: [],
    },
  ];

  assert.deepEqual(validateWhatIfAssumptions(assumptions), []);
  assert.equal(assumptions[1].resolution, "UNRESOLVED");
  assert.equal("routeId" in assumptions[1], false);
});

test("requires confirmed text and rejects excluded field-assignment/media/GPS fields", () => {
  const validPayload = {
    requestId: "field-update-request-0001",
    inputMode: "VOICE_TRANSCRIPT",
    confirmedText: "Đường vào thôn đang ngập, chưa thể tiếp cận.",
    confirmedByUser: true,
  };
  assert.deepEqual(validateFieldUpdatePayload(validPayload), []);

  for (const forbiddenKey of ["assigneeId", "imageUrl", "gpsTrack"]) {
    assert.ok(
      validateFieldUpdatePayload({ ...validPayload, [forbiddenKey]: "forbidden" }).some(
        (error) => error.includes(forbiddenKey),
      ),
    );
  }
});

test("accepts only review-required, evidence-grounded field intents", () => {
  const intent = {
    schemaVersion: FIELD_UPDATE_INTENT_SCHEMA_VERSION,
    kind: "ROUTE_HAZARD",
    confidence: 0.8,
    sourceExcerpt: "Cáº§u La Hai khÃ´ng qua Ä‘Æ°á»£c.",
    requiresAdminVerification: true,
    facts: [
      {
        id: "F1",
        key: "OTHER",
        provenance: "REPORTED",
        value: "Cáº§u La Hai khÃ´ng qua Ä‘Æ°á»£c.",
        qualifier: "EXACT",
        source: {
          sourceType: "FIELD_UPDATE",
          sourceId: "field-update-1",
          excerpt: "Cáº§u La Hai khÃ´ng qua Ä‘Æ°á»£c.",
          capturedAt: null,
        },
      },
    ],
    resolvedReferenceIds: [],
    unresolvedReferences: ["Cáº§u La Hai khÃ´ng qua Ä‘Æ°á»£c."],
  };

  assert.deepEqual(validateFieldUpdateIntent(intent), []);
  assert.ok(
    validateFieldUpdateIntent({ ...intent, requiresAdminVerification: false }).some((error) =>
      error.includes("requiresAdminVerification"),
    ),
  );
  assert.ok(
    validateFieldUpdateIntent({ ...intent, autoDispatch: true }).some((error) =>
      error.includes("autoDispatch"),
    ),
  );
});

test("accepts only grounded non-verified facts from the AI situation extractor", () => {
  const extraction = {
    schemaVersion: SITUATION_EXTRACTION_SCHEMA_VERSION,
    facts: [
      {
        id: "F1",
        key: "ISOLATION_RISK",
        provenance: "REPORTED",
        value: true,
        qualifier: "POSSIBLE",
        source: {
          sourceType: "USER_REPORT",
          sourceId: "report-1",
          excerpt: "có khả năng bị cô lập",
          capturedAt: null,
        },
      },
    ],
    missingData: [],
    conflicts: [],
    priorityQuestion: null,
  };
  assert.deepEqual(validateSituationExtraction(extraction), []);
  assert.ok(
    validateSituationExtraction({
      ...extraction,
      facts: [{ ...extraction.facts[0], provenance: "VERIFIED" }],
    }).some((error) => error.includes("VERIFIED")),
  );
  assert.ok(
    validateSituationExtraction({ ...extraction, autoDispatch: true }).some((error) =>
      error.includes("autoDispatch"),
    ),
  );
});

test("rejects malformed or out-of-range reported operational numbers", () => {
  const extraction = {
    schemaVersion: SITUATION_EXTRACTION_SCHEMA_VERSION,
    facts: [
      {
        id: "F1",
        key: "AFFECTED_PEOPLE",
        provenance: "REPORTED",
        value: "999",
        qualifier: "EXACT",
        source: {
          sourceType: "USER_REPORT",
          sourceId: "report-1",
          excerpt: "18 người",
          capturedAt: null,
        },
      },
    ],
    missingData: [],
    conflicts: [],
    priorityQuestion: null,
  };

  assert.ok(
    validateSituationExtraction(extraction).some((error) => error.includes("AFFECTED_PEOPLE")),
  );
  extraction.facts[0].value = 18;
  assert.deepEqual(validateSituationExtraction(extraction), []);
});

test("uses an explicit no-stock-claim disclaimer for external contacts", () => {
  assert.equal(
    EXTERNAL_CONTACT_DISCLAIMER,
    "Đề xuất liên hệ, chưa xác nhận có hàng",
  );
});
