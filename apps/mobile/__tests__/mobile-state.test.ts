import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_RECORDING_MS,
  selectRecordingBackend,
} from "../audio-platform-state";
import {
  parseOfflineEnvelope,
  serializeOfflineEnvelope,
} from "../offline-cache-state";
import {
  buildInventorySummary,
  tabsForRole,
} from "../dashboard-state";
import {
  canPerformInventoryAction,
  parseScannedInventoryCode,
  parseScannedSku,
  validateLoanReturn,
} from "../inventory-state";
import { parseStoredSession, serializeSession } from "../session-state";
import {
  buildMonthlyReportDraft,
  buildMonthlyReportRows,
  finalizeMonthlyReportDraft,
} from "../monthly-report-state";
import { mobileRoleLabel } from "../role-labels";

const session = {
  accessToken: "access-token",
  refreshToken: "refresh-token",
  user: {
    id: "user-1",
    email: "rescue@safestock.vn",
    role: "RESCUE",
    fullName: "Lực lượng hiện trường",
  },
};

test("RESCUE uses the shared field-force label", () => {
  assert.equal(mobileRoleLabel("RESCUE"), "Lực lượng hiện trường");
});

test("stored session requires both tokens and a stable user identity", () => {
  assert.deepEqual(parseStoredSession(serializeSession(session)), session);
  assert.equal(
    parseStoredSession(
      JSON.stringify({
        version: 1,
        accessToken: "access-token",
        user: session.user,
      }),
    ),
    null,
  );
  assert.equal(parseStoredSession("{not-json"), null);
});

test("monthly report requires an actual count for every batch", () => {
  const draft = buildMonthlyReportDraft([
    {
      id: "batch-1",
      batchCode: "LOT-1",
      quantity: 10,
      condition: "NEW",
      expiryDate: null,
      shelf: { code: "A-01" },
      item: { sku: "RICE-01", name: "Gạo", category: { unit: "kg" } },
    },
  ]);

  assert.throws(
    () => finalizeMonthlyReportDraft(draft),
    /Nhập số đếm thực tế cho RICE-01/,
  );
  assert.equal(finalizeMonthlyReportDraft([{ ...draft[0], countedQuantity: "7" }])[0].quantity, 7);
  assert.equal(draft[0].systemQuantity, 10);
});

test("offline envelope is account-scoped and exposes cache age", () => {
  const storedAt = "2026-07-27T04:00:00.000Z";
  const raw = serializeOfflineEnvelope("user-1", [{ id: "n-1" }], storedAt);

  assert.deepEqual(
    parseOfflineEnvelope(raw, "user-1", new Date("2026-07-27T04:10:00.000Z")),
    {
      data: [{ id: "n-1" }],
      storedAt,
      ageMs: 600_000,
    },
  );
  assert.equal(
    parseOfflineEnvelope(raw, "other-user", new Date("2026-07-27T04:10:00.000Z")),
    null,
  );
});

test("mobile tabs follow the role boundary", () => {
  assert.deepEqual(tabsForRole("REPORTER"), ["report", "alerts"]);
  assert.deepEqual(tabsForRole("RESCUE"), [
    "home",
    "readiness",
    "inventory",
    "alerts",
  ]);
  assert.deepEqual(tabsForRole("WAREHOUSE"), [
    "home",
    "readiness",
    "inventory",
    "monthly-report",
    "alerts",
  ]);
  assert.deepEqual(tabsForRole("ADMIN"), [
    "home",
    "readiness",
    "inventory",
    "monthly-report",
    "alerts",
  ]);
});

test("monthly report keeps each batch and shelf separate while excluding open loans", () => {
  assert.deepEqual(
    buildMonthlyReportRows([
      {
        id: "batch-1",
        batchCode: "LOT-1",
        quantity: 10,
        condition: "NEW",
        expiryDate: "2026-12-01T00:00:00.000Z",
        shelf: { code: "A-01" },
        loans: [
          {
            quantity: 4,
            returnedOk: 1,
            returnedDamaged: 0,
            lost: 0,
          },
        ],
        item: {
          sku: "WATER-01",
          name: "Nước uống",
          category: { unit: "chai" },
        },
      },
      {
        id: "batch-2",
        batchCode: "LOT-2",
        quantity: 5,
        condition: "USED",
        expiryDate: "2026-10-01T00:00:00.000Z",
        shelf: { code: "B-02" },
        item: {
          sku: "WATER-01",
          name: "Nước uống",
          category: { unit: "chai" },
        },
      },
    ]),
    [
      {
        batchId: "batch-1",
        batchCode: "LOT-1",
        shelfCode: "A-01",
        sku: "WATER-01",
        itemName: "Nước uống",
        quantity: 7,
        unit: "chai",
        expiryDate: "2026-12-01",
        condition: "NEW",
        note: null,
      },
      {
        batchId: "batch-2",
        batchCode: "LOT-2",
        shelfCode: "B-02",
        sku: "WATER-01",
        itemName: "Nước uống",
        quantity: 5,
        unit: "chai",
        expiryDate: "2026-10-01",
        condition: "USED",
        note: null,
      },
    ],
  );
});

test("dashboard inventory summary keeps batch, SKU, quantity and risk separate", () => {
  assert.deepEqual(
    buildInventorySummary(
      [
        {
          quantity: 12,
          condition: "NEW",
          expiryDate: "2026-08-02T00:00:00.000Z",
          item: { sku: "WATER-01" },
        },
        {
          quantity: 3,
          condition: "DAMAGED",
          expiryDate: null,
          item: { sku: "WATER-01" },
        },
        {
          quantity: 5,
          condition: "USED",
          expiryDate: "2027-01-01T00:00:00.000Z",
          item: { sku: "ROPE-01" },
        },
      ],
      new Date("2026-07-27T00:00:00.000Z"),
    ),
    {
      batches: 3,
      skus: 2,
      quantity: 20,
      damagedBatches: 1,
      expiringSoonBatches: 1,
    },
  );
});

test("QR payload accepts plain SKU, JSON and URL without trusting arbitrary text", () => {
  assert.equal(parseScannedSku("WATER-01"), "WATER-01");
  assert.equal(parseScannedSku('{"sku":"life-adult"}'), "LIFE-ADULT");
  assert.equal(
    parseScannedSku("https://safestock.local/item?sku=ROPE-01"),
    "ROPE-01",
  );
  assert.equal(parseScannedSku("không phải mã vật tư"), null);
});

test("QR payload preserves the batch code for exact stock identification", () => {
  assert.deepEqual(
    parseScannedInventoryCode(
      "safestock://inventory?sku=water-01&batch=LOT-2026-07",
    ),
    { sku: "WATER-01", batchCode: "LOT-2026-07" },
  );
  assert.deepEqual(
    parseScannedInventoryCode('{"sku":"rope-01","batchCode":"LOT-R-1"}'),
    { sku: "ROPE-01", batchCode: "LOT-R-1" },
  );
});

test("inventory actions remain role-aware on mobile", () => {
  assert.equal(canPerformInventoryAction("WAREHOUSE", "import"), true);
  assert.equal(canPerformInventoryAction("ADMIN", "condition"), true);
  assert.equal(canPerformInventoryAction("RESCUE", "borrow"), true);
  assert.equal(canPerformInventoryAction("RESCUE", "export"), false);
  assert.equal(canPerformInventoryAction("REPORTER", "borrow"), false);
});

test("partial loan return cannot exceed outstanding quantity", () => {
  assert.deepEqual(
    validateLoanReturn(5, { ok: 2, damaged: 1, lost: 0 }),
    { valid: true, total: 3 },
  );
  assert.deepEqual(
    validateLoanReturn(2, { ok: 1, damaged: 1, lost: 1 }),
    { valid: false, total: 3, reason: "Số hoàn vượt quá số còn nợ" },
  );
});

test("voice recording selects an explicit platform backend", () => {
  assert.equal(selectRecordingBackend("android", true, false), "ANDROID_NATIVE");
  assert.equal(selectRecordingBackend("android", false, true), "UNSUPPORTED");
  assert.equal(selectRecordingBackend("web", false, true), "WEB");
  assert.equal(selectRecordingBackend("ios", true, true), "UNSUPPORTED");
});

test("voice clips are capped before the API payload can grow without bound", () => {
  assert.equal(MAX_RECORDING_MS, 60_000);
});
