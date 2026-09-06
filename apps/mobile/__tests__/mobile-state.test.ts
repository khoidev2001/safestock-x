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
import {
  fieldForceActionsFor,
  filterMissionsByNo,
  missionPickupStage,
  missionStageForViewer,
  missionStageLabel,
  missionStageNeedsAction,
  missionWorkStage,
  sortMissionsForFieldForce,
} from "../mission-state";
import {
  MAX_EVIDENCE_PHOTOS,
  addEvidencePhoto,
  base64ByteSize,
  deliveryReportSummary,
  pickCaptureSize,
  removeEvidencePhoto,
  type EvidencePhoto,
} from "../mission-delivery-report";
import {
  buildPickupPlan,
  formatTravel,
  pickupStopStateLabel,
  type PickupRequestInput,
  type PickupRouteInput,
} from "../mission-pickup-plan";
import {
  MAX_VISIBLE_TOASTS,
  TOAST_VISIBLE_MS,
  dismissToast,
  filterNotificationsByMissionNo,
  mergeNotification,
  missionNoQuery,
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
    fullName: "Đội cứu hộ",
  },
};

test("RESCUE uses the shared field-force label", () => {
  assert.equal(mobileRoleLabel("RESCUE"), "Đội cứu hộ");
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
  assert.deepEqual(tabsForRole("WAREHOUSE"), ["home", "report", "warehouse", "alerts", "account"]);
});

test("các mục kho nằm sau tab Quản lý kho, không bày thành nhiều tab riêng", () => {
  // Nhiệm vụ cứu hộ đứng ĐẦU: đó là việc có người đang chờ và có hạn, còn nhập
  // xuất kho thì trưởng thôn chủ động giờ nào cũng làm được.
  assert.deepEqual(warehouseSectionsForRole("WAREHOUSE"), [
    "missions",
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
  return {
    key,
    id: key.split("#")[0]!,
    kind: "INCIDENT_DETECTED",
    title: key,
    body: "",
    missionId,
  };
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
  const list = [
    { id: "n-2", title: "sau" },
    { id: "n-1", title: "trước" },
  ];
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

test("chặng công việc của nhiệm vụ, và chữ hiện lên theo từng vai", () => {
  const pending = [{ status: "PENDING" }, { status: "ACCEPTED" }];
  const accepted = [{ status: "ACCEPTED" }, { status: "PREPARED" }];
  const prepared = [{ status: "PREPARED" }, { status: "PICKED_UP" }];
  const pickedUp = [{ status: "PICKED_UP" }, { status: "PICKED_UP" }];

  // Lấy phiếu chậm nhất làm mốc: còn một mã chưa tiếp nhận thì việc vẫn là tiếp nhận.
  assert.equal(missionWorkStage("READY", pending), "PENDING_ACCEPT");
  assert.equal(missionWorkStage("READY", accepted), "PENDING_PREPARE");
  assert.equal(missionWorkStage("READY", prepared), "PREPARED");
  assert.equal(missionWorkStage("READY", pickedUp), "PICKED_UP");
  // Đã báo kết quả thì mọi phiếu bên dưới không còn đổi được điều gì.
  assert.equal(missionWorkStage("COMPLETED", pending), "COMPLETED");
  // Nhiệm vụ cũ không có phiếu nào thì không kẹt ở mốc đầu.
  assert.equal(missionWorkStage("READY", []), "PICKED_UP");

  // Cùng một mốc, hai vai đọc ra hai việc khác nhau.
  assert.equal(missionStageLabel("WAREHOUSE", "PREPARED"), "Chờ đội cứu hộ lấy");
  assert.equal(missionStageLabel("RESCUE", "PREPARED"), "Cần tới lấy");
  assert.equal(missionStageLabel("WAREHOUSE", "PENDING_ACCEPT"), "Cần tiếp nhận");
  assert.equal(missionStageLabel("RESCUE", "PENDING_ACCEPT"), "Đợi tiếp nhận");
  assert.equal(missionStageLabel("RESCUE", "PICKED_UP"), "Cần báo cáo kết quả");
  assert.equal(missionStageLabel("WAREHOUSE", "PICKED_UP"), "Đội cứu hộ đã lấy");

  // Tới lượt ai thì bật lên với người đó, và chỉ người đó.
  assert.equal(missionStageNeedsAction("WAREHOUSE", "PENDING_ACCEPT"), true);
  assert.equal(missionStageNeedsAction("RESCUE", "PENDING_ACCEPT"), false);
  assert.equal(missionStageNeedsAction("RESCUE", "PREPARED"), true);
  assert.equal(missionStageNeedsAction("WAREHOUSE", "PREPARED"), false);
  assert.equal(missionStageNeedsAction("RESCUE", "COMPLETED"), false);
});

test("tìm thông báo theo số hiệu nhiệm vụ", () => {
  const items = [
    { id: "n-1", title: "Nhiệm vụ số 193 — kho đã xuất hàng", missionNo: 193 },
    { id: "n-2", title: "Nhiệm vụ số 19 — chờ kho chuẩn bị", missionNo: 19 },
    { id: "n-3", title: "Kho thôn Long Châu xuống mức sẵn sàng", missionNo: null },
    // Bản ghi cũ: máy chủ chưa chép số hiệu, số chỉ nằm trong tiêu đề.
    { id: "n-4", title: "Nhiệm vụ số 88 đã hoàn thành" },
  ];

  // Gõ dở chừng vẫn thu hẹp dần: "19" ra cả 193 lẫn 19.
  assert.deepEqual(
    filterNotificationsByMissionNo(items, "19").map((item) => item.id),
    ["n-1", "n-2"],
  );
  assert.deepEqual(
    filterNotificationsByMissionNo(items, "193").map((item) => item.id),
    ["n-1"],
  );
  // Bản ghi cũ tìm được qua tiêu đề.
  assert.deepEqual(
    filterNotificationsByMissionNo(items, "88").map((item) => item.id),
    ["n-4"],
  );
  // Từ khoá rỗng (hoặc chỉ có ký tự không phải số) giữ nguyên cả danh sách —
  // khác hẳn với "không tìm thấy gì".
  assert.equal(filterNotificationsByMissionNo(items, "").length, 4);
  assert.equal(filterNotificationsByMissionNo(items, "  ").length, 4);
  // Người trực gõ theo cách họ nói.
  assert.equal(missionNoQuery("số 193"), "193");
  assert.equal(missionNoQuery("#193"), "193");
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

// ---- Lộ trình lấy vật tư của lực lượng hiện trường ----

const centralRoute: PickupRouteInput = {
  id: "kho-trung-tam",
  name: "Kho xã Đồng Xuân",
  kind: "CENTRAL",
  lat: 13.3782428,
  lng: 109.104259,
  distanceKm: 2.4,
  etaMinutes: 9,
  routeStatus: "ROUTED",
  contributions: [
    { sku: "WATER-01", itemName: "Nước uống đóng chai", quantity: 620, unit: "chai" },
    { sku: "LIFE-ADULT", itemName: "Áo phao người lớn", quantity: 108, unit: "chiếc" },
  ],
};

const hamletRoute: PickupRouteInput = {
  id: "kho-thon",
  name: "Kho thôn Long Châu",
  kind: "HAMLET",
  lat: 13.3806601,
  lng: 109.1068446,
  distanceKm: 0.3,
  etaMinutes: 4,
  routeStatus: "ROUTED",
  contributions: [{ sku: "LIFE-CHILD", itemName: "Áo phao trẻ em", quantity: 8, unit: "chiếc" }],
};

function pickupRequest(overrides: Partial<PickupRequestInput> = {}): PickupRequestInput {
  return {
    warehouseId: "kho-trung-tam",
    sku: "WATER-01",
    itemName: "Nước uống đóng chai",
    unit: "chai",
    requestedQuantity: 620,
    preparedQuantity: 0,
    pickedUpQuantity: null,
    status: "PENDING",
    ...overrides,
  };
}

test("kho gần điểm gặp nạn xếp trước để đi từ trên xuống là đúng thứ tự", () => {
  const stops = buildPickupPlan([centralRoute, hamletRoute], []);
  assert.deepEqual(
    stops.map((stop) => stop.warehouseId),
    ["kho-thon", "kho-trung-tam"],
  );
});

test("kho chưa tính được tuyến vẫn hiện, nhưng không chen lên trước kho đã biết là gần", () => {
  const stops = buildPickupPlan(
    [hamletRoute],
    [
      pickupRequest({
        warehouseId: "kho-la",
        warehouse: { id: "kho-la", name: "Kho thôn Triêm Đức" },
      }),
    ],
  );
  assert.deepEqual(
    stops.map((stop) => stop.warehouseId),
    ["kho-thon", "kho-la"],
  );
  assert.equal(stops[1].name, "Kho thôn Triêm Đức");
  assert.equal(stops[1].distanceKm, null);
});

test("số phải lấy là số kho đã soạn, không phải số theo phương án", () => {
  const [stop] = buildPickupPlan(
    [centralRoute],
    [pickupRequest({ status: "PREPARED", preparedQuantity: 500 })],
  );
  const water = stop.items.find((item) => item.sku === "WATER-01");
  assert.equal(water?.quantity, 500);
  assert.equal(water?.status, "PREPARED");
  // Dòng chưa có yêu cầu kèm theo vẫn giữ số phân bổ của phương án.
  assert.equal(stop.items.find((item) => item.sku === "LIFE-ADULT")?.quantity, 108);
});

test("kho đã xuất đủ thì báo đã xuất kho, xuất một phần thì vẫn là đang soạn", () => {
  const fullyPicked = buildPickupPlan(
    [hamletRoute],
    [
      pickupRequest({
        warehouseId: "kho-thon",
        sku: "LIFE-CHILD",
        itemName: "Áo phao trẻ em",
        unit: "chiếc",
        status: "PICKED_UP",
        preparedQuantity: 8,
        pickedUpQuantity: 8,
      }),
    ],
  )[0];
  assert.deepEqual(pickupStopStateLabel(fullyPicked), { label: "Đã xuất kho đủ", tone: "done" });

  const onlyOnePrepared = buildPickupPlan(
    [centralRoute],
    [pickupRequest({ status: "PREPARED", preparedQuantity: 620 })],
  )[0];
  assert.equal(pickupStopStateLabel(onlyOnePrepared).tone, "waiting");
  assert.equal(pickupStopStateLabel(onlyOnePrepared).label, "Soạn xong 1/2");
});

test("chưa tính được tuyến thì nói thẳng, không in ra 0 km", () => {
  assert.equal(formatTravel(0.8, 6), "0.8 km · ~6 phút");
  assert.equal(formatTravel(null, null), "Chưa tính được quãng đường");
  assert.equal(formatTravel(1.2, null), "Chưa tính được quãng đường");
});

const evidence = (id: string, bytes = 12): EvidencePhoto => ({
  id,
  dataBase64: Buffer.alloc(bytes, 7).toString("base64"),
});

test("báo kết quả: ô trống và không ảnh vẫn gửi được, nhưng phải nói rõ đang gửi gì", () => {
  assert.equal(
    deliveryReportSummary("   ", 0),
    "Chưa nhập kết quả và chưa có ảnh — vẫn xác nhận hoàn thành được.",
  );
  assert.equal(deliveryReportSummary("Đã giao đủ", 0), "Gửi kèm kết quả bằng chữ, không có ảnh.");
  assert.equal(deliveryReportSummary("", 2), "Gửi kèm 2 ảnh bằng chứng, không có ghi chú.");
  assert.equal(deliveryReportSummary("Đã giao đủ", 2), "Gửi kèm kết quả và 2 ảnh bằng chứng.");
});

test("ảnh bằng chứng: đếm đúng số byte thật của base64", () => {
  assert.equal(base64ByteSize(Buffer.alloc(100, 1).toString("base64")), 100);
  assert.equal(
    base64ByteSize("data:image/jpeg;base64," + Buffer.alloc(7, 1).toString("base64")),
    7,
  );
  assert.equal(base64ByteSize(""), 0);
});

test("ảnh bằng chứng: chặn quá trần và ảnh hỏng ngay trên máy, trước khi tốn sóng", () => {
  const full = Array.from({ length: MAX_EVIDENCE_PHOTOS }, (_, i) => evidence(`p${i}`));
  const overflow = addEvidencePhoto(full, evidence("thua"));
  assert.equal(overflow.photos.length, MAX_EVIDENCE_PHOTOS);
  assert.equal(overflow.error, `Mỗi lần báo kèm tối đa ${MAX_EVIDENCE_PHOTOS} ảnh.`);

  const broken = addEvidencePhoto([], { id: "hong", dataBase64: "" });
  assert.deepEqual(broken.photos, []);
  assert.equal(broken.error, "Ảnh chụp bị lỗi, hãy chụp lại.");

  const heavy = addEvidencePhoto([], {
    id: "nang",
    dataBase64: Buffer.alloc(5 * 1024 * 1024 + 1, 1).toString("base64"),
  });
  assert.equal(heavy.error, "Ảnh nặng quá 5MB, hãy chụp lại.");
});

test("ảnh bằng chứng: thêm và bỏ từng tấm, không đụng tấm khác", () => {
  const one = addEvidencePhoto([], evidence("a"));
  assert.equal(one.error, undefined);
  const two = addEvidencePhoto(one.photos, evidence("b"));
  assert.deepEqual(
    removeEvidencePhoto(two.photos, "a").map((photo) => photo.id),
    ["b"],
  );
});

test("ảnh bằng chứng: chọn cỡ chụp vừa đủ, không chụp hết cỡ cảm biến", () => {
  // Danh sách kiểu Android trả về: chọn 1920x1080 chứ không phải 4032x3024.
  assert.equal(pickCaptureSize(["4032x3024", "1920x1080", "1280x720", "640x480"]), "1920x1080");
  // Không cỡ nào đủ 1600px, hoặc máy chỉ trả về tên preset: giữ mặc định của máy.
  assert.equal(pickCaptureSize(["1280x720", "640x480"]), undefined);
  assert.equal(pickCaptureSize(["Photo", "High", "Medium"]), undefined);
  assert.equal(pickCaptureSize([]), undefined);
});

test("chặng của người đi giao: chờ kho → tới lấy → đã cầm hàng", () => {
  const requests = [{ status: "PREPARED" }, { status: "PICKED_UP" }];
  // Kho chưa xuất xong thì chưa có gì để đi lấy.
  assert.equal(missionPickupStage("PENDING_WAREHOUSE", requests), "WAITING_WAREHOUSE");
  // Kho xuất xong nhưng chưa ký nhận đủ: tới kho lấy hàng, chưa báo kết quả được.
  assert.equal(missionPickupStage("READY", requests), "READY_FOR_PICKUP");
  // Ký nhận đủ mới là lúc hàng thật sự trong tay người đi giao.
  assert.equal(
    missionPickupStage("READY", [{ status: "PICKED_UP" }, { status: "PICKED_UP" }]),
    "PICKED_UP",
  );
});

test("nhiệm vụ cũ không có phiếu theo vật tư thì không kẹt ở chặng chờ ký nhận", () => {
  // Dữ liệu trước khi tách phiếu theo SKU không có chữ ký nào để chờ; bắt chờ là
  // khoá luôn, không còn đường đóng nhiệm vụ.
  assert.equal(missionPickupStage("READY", []), "PICKED_UP");
  assert.equal(missionPickupStage("READY", undefined), "PICKED_UP");
});

// ===== Tab Nhiệm vụ: chặng theo vai, và tìm theo số hiệu =====

const request = (warehouseId: string, status: string) => ({ warehouseId, status });

test("đội cứu hộ đọc chặng CHUNG của cả nhiệm vụ, gồm mọi kho", () => {
  // Họ chờ toàn bộ kho xuất xong mới đi lấy, nên một kho còn nợ là chặng chưa tới.
  const mission = {
    status: "PENDING_WAREHOUSE",
    warehouseRequests: [request("kho-a", "PREPARED"), request("kho-b", "PENDING")],
  };

  assert.equal(missionStageForViewer(mission, "RESCUE", null), "PENDING_ACCEPT");
});

test("trưởng thôn chỉ đọc phiếu của CHÍNH KHO MÌNH", () => {
  // Kho A xuất xong phần của mình thì phải thấy "đã xong", đừng vì kho B còn nợ
  // mà bắt họ đi kiểm lại kệ rồi chẳng thấy gì để xuất.
  const mission = {
    status: "PENDING_WAREHOUSE",
    warehouseRequests: [request("kho-a", "PREPARED"), request("kho-b", "PENDING")],
  };

  assert.equal(missionStageForViewer(mission, "WAREHOUSE", "kho-a"), "PREPARED");
  assert.equal(missionStageForViewer(mission, "WAREHOUSE", "kho-b"), "PENDING_ACCEPT");
});

test("hiện trường báo xong thì cả hai vai đều đọc ra đã hoàn thành", () => {
  const mission = {
    status: "COMPLETED",
    warehouseRequests: [request("kho-a", "PREPARED")],
  };

  assert.equal(missionStageForViewer(mission, "RESCUE", null), "COMPLETED");
  assert.equal(missionStageForViewer(mission, "WAREHOUSE", "kho-a"), "COMPLETED");
});

test("kho không có phiếu nào trong nhiệm vụ thì không kẹt ở mốc đầu", () => {
  const mission = { status: "PENDING_WAREHOUSE", warehouseRequests: [request("kho-a", "PENDING")] };

  assert.equal(missionStageForViewer(mission, "WAREHOUSE", "kho-khac"), "PICKED_UP");
});

test("tìm nhiệm vụ theo số hiệu, gõ dở chừng vẫn thu hẹp dần", () => {
  const missions = [{ missionNo: 19 }, { missionNo: 193 }, { missionNo: 27 }];

  assert.deepEqual(filterMissionsByNo(missions, "19"), [{ missionNo: 19 }, { missionNo: 193 }]);
  assert.deepEqual(filterMissionsByNo(missions, "193"), [{ missionNo: 193 }]);
});

test("từ khoá viết theo cách người ta nói đều ra cùng một kết quả", () => {
  const missions = [{ missionNo: 193 }];

  for (const query of ["193", "số 193", "#193", " 1 9 3 "]) {
    assert.deepEqual(filterMissionsByNo(missions, query), missions, query);
  }
});

test("từ khoá rỗng thì giữ nguyên cả danh sách, không lọc mất gì", () => {
  const missions = [{ missionNo: 19 }, { missionNo: null }];

  assert.deepEqual(filterMissionsByNo(missions, "   "), missions);
  // Nhưng đang tìm thì bản ghi thiếu số hiệu không thể khớp — đừng đoán từ chữ.
  assert.deepEqual(filterMissionsByNo(missions, "19"), [{ missionNo: 19 }]);
});

test("nhiệm vụ vừa xem được ghim lên đầu, trên cả việc cần làm ngay", () => {
  const missions = [
    { id: "a", status: "READY", createdAt: "2026-09-06T18:00:00Z" },
    { id: "b", status: "PENDING_WAREHOUSE", createdAt: "2026-09-06T18:16:00Z" },
    { id: "c", status: "COMPLETED", createdAt: "2026-09-06T19:00:00Z" },
  ];

  // Không ghim: việc cần làm ngay (READY) lên đầu, việc đã đóng xuống cuối.
  assert.deepEqual(
    sortMissionsForFieldForce(missions).map((m) => m.id),
    ["a", "b", "c"],
  );

  // Ghim nhiệm vụ vừa xem — kể cả khi nó đã đóng sổ, vì người dùng vừa rời khỏi nó.
  assert.deepEqual(
    sortMissionsForFieldForce(missions, { pinnedMissionId: "c" }).map((m) => m.id),
    ["c", "a", "b"],
  );

  // Ghim một id không còn trong danh sách thì thứ tự giữ nguyên như cũ.
  assert.deepEqual(
    sortMissionsForFieldForce(missions, { pinnedMissionId: "khong-ton-tai" }).map((m) => m.id),
    ["a", "b", "c"],
  );
});
