import assert from "node:assert/strict";
import test from "node:test";
import { MAX_RECORDING_MS, selectRecordingBackend } from "../audio-platform-state";
import { parseOfflineEnvelope, serializeOfflineEnvelope } from "../offline-cache-state";
import { buildInventorySummary, initialTabForRole, tabsForRole } from "../dashboard-state";
import {
  canPerformInventoryAction,
  parseScannedInventoryCode,
  parseScannedSku,
  validateLoanReturn,
} from "../inventory-state";
import { fieldForceActionsFor, sortMissionsForFieldForce } from "../mission-state";
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
    email: "rescue@ungphonhanh.life",
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

  assert.throws(() => finalizeMonthlyReportDraft(draft), /Nhập số đếm thực tế cho RICE-01/);
  assert.equal(finalizeMonthlyReportDraft([{ ...draft[0], countedQuantity: "7" }])[0].quantity, 7);
  assert.equal(draft[0].systemQuantity, 10);
});

test("offline envelope is account-scoped and exposes cache age", () => {
  const storedAt = "2026-07-27T04:00:00.000Z";
  const raw = serializeOfflineEnvelope("user-1", [{ id: "n-1" }], storedAt);

  assert.deepEqual(parseOfflineEnvelope(raw, "user-1", new Date("2026-07-27T04:10:00.000Z")), {
    data: [{ id: "n-1" }],
    storedAt,
    ageMs: 600_000,
  });
  assert.equal(parseOfflineEnvelope(raw, "other-user", new Date("2026-07-27T04:10:00.000Z")), null);
});

test("app điện thoại chỉ có hai giao diện, chia theo vai lúc đăng nhập", () => {
  // Lực lượng hiện trường KHÔNG có nghiệp vụ kho: họ xem xét tình hình thực tế
  // rồi gửi yêu cầu, việc đối chiếu tồn và cho mượn là của người giữ kho.
  assert.deepEqual(tabsForRole("RESCUE"), ["missions", "report", "alerts"]);

  // Quản lý kho tại chỗ kiêm luôn trưởng thôn, nên có cả kho lẫn màn báo cáo.
  assert.deepEqual(tabsForRole("WAREHOUSE"), [
    "home",
    "readiness",
    "inventory",
    "monthly-report",
    "report",
    "alerts",
  ]);
});

test("ADMIN trên điện thoại chỉ để quét QR nhập xuất, không mang cả bảng điều hành", () => {
  assert.deepEqual(tabsForRole("ADMIN"), ["inventory"]);
});

test("không vai nào trên điện thoại còn thấy màn của trưởng thôn cũ", () => {
  // Vai REPORTER đã bị bỏ; giá trị lạ rơi về giao diện kho chứ không được vỡ.
  assert.deepEqual(tabsForRole("REPORTER"), tabsForRole("WAREHOUSE"));
});

test("mở app vào thẳng việc chính của từng vai", () => {
  assert.equal(initialTabForRole("RESCUE"), "missions");
  assert.equal(initialTabForRole("WAREHOUSE"), "home");
  assert.equal(initialTabForRole("ADMIN"), "inventory");
});

test("lực lượng hiện trường chỉ thấy nút khi thao tác thực sự đi được", () => {
  // Xã phát hành phương án thẳng tới kho, nên hiện trường không nhận/từ chối ở
  // đầu luồng. Chỉ khi vật tư đã sẵn ở kho thì mới có việc để làm: đi giao và
  // báo kết quả. Nút bấm vào là báo lỗi còn tệ hơn không có nút.
  assert.deepEqual(fieldForceActionsFor("READY"), ["complete"]);
  for (const status of ["DRAFT", "PENDING_WAREHOUSE", "COMPLETED", "CANCELLED"]) {
    assert.deepEqual(fieldForceActionsFor(status), []);
  }
});

test("việc cần làm ngay xếp lên đầu, việc đã đóng xuống cuối", () => {
  const sorted = sortMissionsForFieldForce([
    { id: "xong", status: "COMPLETED", createdAt: "2026-07-31T10:00:00.000Z" },
    { id: "dang-cho-kho", status: "PENDING_WAREHOUSE", createdAt: "2026-07-31T09:00:00.000Z" },
    { id: "can-di-giao", status: "READY", createdAt: "2026-07-31T08:00:00.000Z" },
  ]);

  assert.deepEqual(
    sorted.map((mission) => mission.id),
    ["can-di-giao", "dang-cho-kho", "xong"],
  );
});

test("nhiều lệnh cùng cần xử lý thì mới nhất trước", () => {
  const sorted = sortMissionsForFieldForce([
    { id: "cu", status: "READY", createdAt: "2026-07-30T08:00:00.000Z" },
    { id: "moi", status: "READY", createdAt: "2026-07-31T08:00:00.000Z" },
  ]);

  assert.deepEqual(
    sorted.map((mission) => mission.id),
    ["moi", "cu"],
  );
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
  assert.equal(parseScannedSku("https://safestock.local/item?sku=ROPE-01"), "ROPE-01");
  assert.equal(parseScannedSku("không phải mã vật tư"), null);
});

test("QR payload preserves the batch code for exact stock identification", () => {
  assert.deepEqual(
    parseScannedInventoryCode("safestock://inventory?sku=water-01&batch=LOT-2026-07"),
    { sku: "WATER-01", batchCode: "LOT-2026-07" },
  );
  assert.deepEqual(parseScannedInventoryCode('{"sku":"rope-01","batchCode":"LOT-R-1"}'), {
    sku: "ROPE-01",
    batchCode: "LOT-R-1",
  });
});

test("chỉ người giữ kho có đủ nghiệp vụ kho trên điện thoại", () => {
  for (const action of ["import", "export", "transfer", "reconcile", "borrow", "return"] as const) {
    assert.equal(canPerformInventoryAction("WAREHOUSE", action), true);
  }
});

test("ADMIN cầm điện thoại chỉ quét QR nhập và xuất", () => {
  assert.equal(canPerformInventoryAction("ADMIN", "import"), true);
  assert.equal(canPerformInventoryAction("ADMIN", "export"), true);
  assert.equal(canPerformInventoryAction("ADMIN", "condition"), false);
  assert.equal(canPerformInventoryAction("ADMIN", "transfer"), false);
  assert.equal(canPerformInventoryAction("ADMIN", "borrow"), false);
});

test("lực lượng hiện trường không có thao tác kho nào", () => {
  // Trước đây giao diện mời họ bấm 'Mượn vật tư' nhưng máy chủ trả 403 — nút bấm
  // vào là báo lỗi thì thà đừng có nút.
  for (const action of ["borrow", "return", "export", "import"] as const) {
    assert.equal(canPerformInventoryAction("RESCUE", action), false);
  }
});

test("partial loan return cannot exceed outstanding quantity", () => {
  assert.deepEqual(validateLoanReturn(5, { ok: 2, damaged: 1, lost: 0 }), {
    valid: true,
    total: 3,
  });
  assert.deepEqual(validateLoanReturn(2, { ok: 1, damaged: 1, lost: 1 }), {
    valid: false,
    total: 3,
    reason: "Số hoàn vượt quá số còn nợ",
  });
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
