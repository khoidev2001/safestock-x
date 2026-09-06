import assert from "node:assert/strict";
import test from "node:test";
import { MAX_RECORDING_MS, selectRecordingBackend } from "../audio-platform-state";
import { parseOfflineEnvelope, serializeOfflineEnvelope } from "../offline-cache-state";
import {
  buildInventorySummary,
  initialTabForRole,
  tabsForRole,
  warehouseSectionsForRole,
} from "../dashboard-state";
import {
  canPerformInventoryAction,
  parseScannedInventoryCode,
  parseScannedSku,
  validateLoanReturn,
} from "../inventory-state";
import { fieldForceActionsFor, sortMissionsForFieldForce } from "../mission-state";
import {
  MAX_VISIBLE_TOASTS,
  TOAST_VISIBLE_MS,
  dismissToast,
  mergeNotification,
  pushToast,
  type ToastEntry,
} from "../notification-feed-state";
import { parseStoredSession, serializeSession } from "../session-state";
import {
  blockingMonthlyReport,
  buildMonthlyReportDraft,
  buildMonthlyReportRows,
  finalizeMonthlyReportDraft,
  isValidReportPeriod,
} from "../monthly-report-state";
import { mobileRoleLabel } from "../role-labels";

const session = {
  accessToken: "access-token",
  refreshToken: "refresh-token",
  user: {
    id: "user-1",
    email: "rescue",
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
  assert.deepEqual(tabsForRole("RESCUE"), ["missions", "report", "alerts", "account"]);

  // Quản lý kho tại chỗ kiêm luôn trưởng thôn, nên có cả kho lẫn màn báo cáo.
  // Sẵn sàng, Kho và Kiểm kê cùng nói về một cái kho nên nằm chung một tab.
  assert.deepEqual(tabsForRole("WAREHOUSE"), [
    "home",
    "report",
    "warehouse",
    "alerts",
    "account",
  ]);
});

test("ba mục kho nằm sau tab Quản lý kho, không bày thành ba tab riêng", () => {
  assert.deepEqual(warehouseSectionsForRole("WAREHOUSE"), [
    "inventory",
    "readiness",
    "monthly-report",
  ]);

  // ADMIN chỉ quét QR tại kệ, nên vào tab kho là thấy thẳng màn Kho — không kèm
  // mức sẵn sàng và báo cáo kiểm kê tháng của người giữ kho tại chỗ.
  assert.deepEqual(warehouseSectionsForRole("ADMIN"), ["inventory"]);
});

test("ADMIN trên điện thoại chỉ để quét QR nhập xuất, không mang cả bảng điều hành", () => {
  assert.deepEqual(tabsForRole("ADMIN"), ["warehouse", "account"]);
});

test("không vai nào trên điện thoại còn thấy màn của trưởng thôn cũ", () => {
  // Vai REPORTER đã bị bỏ; giá trị lạ rơi về giao diện kho chứ không được vỡ.
  assert.deepEqual(tabsForRole("REPORTER"), tabsForRole("WAREHOUSE"));
});

test("mọi vai đều có tab Tài khoản để đăng xuất", () => {
  // Nút đăng xuất phải có MỘT chỗ chắc chắn tìm thấy ở mọi vai. Vai nào thiếu
  // tab này thì người dùng kẹt lại trong phiên đang mở trên máy dùng chung.
  for (const role of ["WAREHOUSE", "RESCUE", "ADMIN", "REPORTER"]) {
    assert.ok(tabsForRole(role).includes("account"), `vai ${role} thiếu tab Tài khoản`);
  }
});

test("mở app vào thẳng việc chính của từng vai", () => {
  assert.equal(initialTabForRole("RESCUE"), "missions");
  assert.equal(initialTabForRole("WAREHOUSE"), "home");
  assert.equal(initialTabForRole("ADMIN"), "warehouse");
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

function toast(key: string, missionId: string | null = null): ToastEntry {
  return { key, id: key.split("#")[0]!, kind: "INCIDENT_DETECTED", title: key, body: "", missionId };
}

test("thông báo mới nhất luôn nằm trên, đẩy thông báo cũ xuống", () => {
  // Truyền thẳng giới hạn để bài này chỉ nói về THỨ TỰ; phần cắt bớt khi dồn dập
  // do bài kế tiếp giữ.
  let stack: ToastEntry[] = [];
  stack = pushToast(stack, toast("a#1"), 3);
  stack = pushToast(stack, toast("b#2"), 3);
  stack = pushToast(stack, toast("c#3"), 3);

  assert.deepEqual(
    stack.map((item) => item.key),
    ["c#3", "b#2", "a#1"],
  );
});

test("thông báo dồn dập không lấp kín màn hình", () => {
  // Lúc bão về thì thông báo tới liên tục. Không chặn thì chúng phủ hết màn hình
  // và che mất chính việc người dùng đang làm — cái cũ nhất phải rơi ra, nhưng
  // vẫn còn nguyên trong tab Thông báo.
  const keys = ["a#1", "b#2", "c#3", "d#4", "e#5"];
  let stack: ToastEntry[] = [];
  for (const key of keys) {
    stack = pushToast(stack, toast(key));
  }

  assert.equal(stack.length, MAX_VISIBLE_TOASTS);
  // Giữ đúng những cái MỚI NHẤT, xếp mới trước cũ sau.
  assert.deepEqual(
    stack.map((item) => item.key),
    keys.slice(-MAX_VISIBLE_TOASTS).reverse(),
  );
});

test("mỗi thông báo nổi 5 giây", () => {
  assert.equal(TOAST_VISIBLE_MS, 5000);
});

test("hết giờ hoặc bấm đóng thì chỉ tắt đúng cái đó", () => {
  const stack = [toast("c#3"), toast("b#2"), toast("a#1")];

  assert.deepEqual(
    dismissToast(stack, "b#2").map((item) => item.key),
    ["c#3", "a#1"],
  );
  // Khoá không còn trong chồng (bấm đóng đúng lúc hết giờ) thì không làm gì cả.
  assert.deepEqual(dismissToast(stack, "z#9"), stack);
});

test("máy chủ gửi lại cùng một thông báo thì nó nổi lại, không nhân đôi trong danh sách", () => {
  // Backend cập nhật rồi đẩy lại (updateAndPush) vẫn giữ nguyên id.
  const list = [{ id: "n-2", title: "sau" }, { id: "n-1", title: "trước" }];
  const merged = mergeNotification(list, { id: "n-1", title: "trước · đã cập nhật" });

  assert.deepEqual(merged, [
    { id: "n-1", title: "trước · đã cập nhật" },
    { id: "n-2", title: "sau" },
  ]);

  // Còn ở chồng thông báo nổi thì đó là HAI lượt hiện khác nhau, nên khoá khác
  // nhau — nếu dùng chung id làm khoá, lượt mới sẽ thừa hưởng bộ đếm 5 giây của
  // lượt cũ và có khi tắt ngay khi vừa hiện.
  const stack = pushToast(pushToast([], toast("n-1#1")), toast("n-1#2"));
  assert.deepEqual(
    stack.map((item) => item.key),
    ["n-1#2", "n-1#1"],
  );
});

test("kỳ đã có báo cáo chờ duyệt hoặc đã duyệt thì chặn gửi lại", () => {
  const reports = [
    { warehouseId: "kho-1", period: "2026-09", status: "PENDING" },
    { warehouseId: "kho-1", period: "2026-08", status: "APPROVED" },
    { warehouseId: "kho-1", period: "2026-07", status: "REJECTED" },
    { warehouseId: "kho-2", period: "2026-09", status: "APPROVED" },
  ];

  assert.equal(blockingMonthlyReport(reports, "kho-1", "2026-09")?.status, "PENDING");
  assert.equal(blockingMonthlyReport(reports, "kho-1", "2026-08")?.status, "APPROVED");
  // Bị từ chối thì PHẢI gửi lại được — đó là mục đích của việc từ chối.
  assert.equal(blockingMonthlyReport(reports, "kho-1", "2026-07"), null);
  // Kho khác nộp rồi không liên quan đến kho mình.
  assert.equal(blockingMonthlyReport(reports, "kho-1", "2026-10"), null);
  assert.equal(blockingMonthlyReport(reports, "", "2026-09"), null);
});

test("kỳ báo cáo chỉ hợp lệ khi đúng dạng YYYY-MM và tháng 01–12", () => {
  assert.equal(isValidReportPeriod("2026-09"), true);
  assert.equal(isValidReportPeriod(" 2026-01 "), true);
  assert.equal(isValidReportPeriod("2026-13"), false);
  assert.equal(isValidReportPeriod("2026-00"), false);
  assert.equal(isValidReportPeriod("2026-9"), false);
  assert.equal(isValidReportPeriod("09-2026"), false);
  assert.equal(isValidReportPeriod(""), false);
});
