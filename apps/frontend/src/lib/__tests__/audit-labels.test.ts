import assert from "node:assert/strict";
import { test } from "node:test";

import {
  AUDIT_ACTION_LABELS,
  AUDIT_ENTITY_LABELS,
  auditActionLabel,
  auditEntityLabel,
  auditReasonLabel,
  auditStatusLabel,
} from "../audit-labels";

/**
 * Mọi mã `action` backend đang ghi vào `AuditLog`.
 *
 * Chép tay từ các lệnh `auditLog.create` và `audit.record` bên
 * `apps/backend/src`. Danh sách này là CHỐT: thêm nghiệp vụ mới ở backend mà quên
 * dịch thì test đỏ ngay, thay vì lặng lẽ rơi ra một dòng tiếng Anh giữa nhật ký.
 *
 * Nhóm kho sinh động từ `INVENTORY_${TransactionType}` nên phải liệt kê đủ chín
 * giá trị của enum `TransactionType`, không chỉ mấy cái thường gặp.
 */
const BACKEND_ACTIONS = [
  "INVENTORY_IMPORT",
  "INVENTORY_EXPORT",
  "INVENTORY_TRANSFER",
  "INVENTORY_RETURN",
  "INVENTORY_ADJUST",
  "INVENTORY_COUNT",
  "INVENTORY_CONDITION",
  "INVENTORY_LOAN_OUT_INTERXA",
  "INVENTORY_LOAN_IN",
  "INVENTORY_RECONCILE",
  "INVENTORY_CREATE_ITEM",
  "INVENTORY_RECEIVE_BATCH",
  "LOAN_BORROW",
  "LOAN_RETURN",
  "REPORT_SUBMIT",
  "REPORT_APPROVE",
  "REPORT_REJECT",
  "WAREHOUSE_LOCATION_UPDATE",
  "HAMLET_CREATE",
  "HAMLET_UPDATE",
  "MISSION_ANALYSIS_SAVED",
  "MISSION_WHAT_IF_SAVED",
  "MISSION_FIELD_UPDATE_RECORDED",
  "MISSION_FIELD_UPDATE_INTENT_SAVED",
  "MUTATION_RECEIPT",
  "SEED_STANDARD_DATASET",
];

/** Mọi giá trị `entity` backend đang ghi, cộng hai loại dùng cho nút lọc. */
const BACKEND_ENTITIES = [
  "ItemBatch",
  "Item",
  "LoanRecord",
  "MonthlyStockReport",
  "Warehouse",
  "Hamlet",
  "MissionAnalysisSnapshot",
  "MissionFieldUpdate",
  "Organization",
];

test("mọi thao tác backend ghi ra đều có tên tiếng Việt", () => {
  const thieu = BACKEND_ACTIONS.filter((action) => !(action in AUDIT_ACTION_LABELS));
  assert.deepEqual(thieu, []);
});

test("mọi loại bản ghi backend ghi ra đều có tên tiếng Việt", () => {
  const thieu = BACKEND_ENTITIES.filter((entity) => !(entity in AUDIT_ENTITY_LABELS));
  assert.deepEqual(thieu, []);
});

/**
 * Từ tiếng Anh có trong chính các mã của backend.
 *
 * KHÔNG kiểm bằng cách đòi mỗi nhãn phải có dấu tiếng Việt: "Kho" là tiếng Việt
 * đúng nghĩa mà chẳng có dấu nào, và luật đó đánh trượt nó ngay. Chặn thẳng những
 * từ sẽ lọt ra nếu ai đó chép nguyên mã vào bảng nhãn mới là đúng thứ cần bắt.
 */
const TU_TIENG_ANH = [
  "inventory",
  "export",
  "import",
  "transfer",
  "return",
  "adjust",
  "count",
  "condition",
  "reconcile",
  "create",
  "receive",
  "batch",
  "item",
  "loan",
  "borrow",
  "report",
  "submit",
  "approve",
  "reject",
  "warehouse",
  "location",
  "update",
  "hamlet",
  "mission",
  "analysis",
  "saved",
  "snapshot",
  "field",
  "intent",
  "recorded",
  "mutation",
  "receipt",
  "evidence",
];

test("không nhãn nào còn sót chữ tiếng Anh", () => {
  for (const [ma, nhan] of [
    ...Object.entries(AUDIT_ACTION_LABELS),
    ...Object.entries(AUDIT_ENTITY_LABELS),
  ]) {
    const thuong = nhan.toLowerCase();
    const dinh = TU_TIENG_ANH.filter((tu) => new RegExp(`\\b${tu}\\b`).test(thuong));
    assert.deepEqual(dinh, [], `${ma} còn chữ tiếng Anh trong "${nhan}"`);
  }
});

test("dịch đúng mấy dòng người dùng đã chụp lại được", () => {
  assert.equal(auditActionLabel("INVENTORY_EXPORT"), "Xuất vật tư khỏi kho");
  assert.equal(auditActionLabel("MISSION_ANALYSIS_SAVED"), "Lưu bản tham mưu nhiệm vụ");
  assert.equal(auditEntityLabel("MissionAnalysisSnapshot"), "Bản tham mưu nhiệm vụ");
  assert.equal(auditEntityLabel("ItemBatch"), "Lô vật tư");
});

test("mã lạ thì nói thẳng là chưa đặt tên, và giữ nguyên mã gốc", () => {
  // Không bịa một câu tiếng Việt nghe xuôi tai từ mã máy: đoán sai nghĩa của một
  // dòng hậu kiểm còn tệ hơn thừa nhận là chưa dịch. Giữ mã để còn tra ngược.
  assert.equal(auditActionLabel("MOT_THU_MOI"), "Thao tác chưa đặt tên (MOT_THU_MOI)");
  assert.equal(auditEntityLabel("ThuMoi"), "Loại bản ghi khác (ThuMoi)");
});

test("trạng thái báo cáo tháng ở vế trước/sau cũng là tiếng Việt", () => {
  assert.equal(auditStatusLabel("PENDING"), "Chờ duyệt");
  assert.equal(auditStatusLabel("APPROVED"), "Đã duyệt");
  assert.equal(auditStatusLabel("REJECTED"), "Đã từ chối");
  // Trạng thái lạ giữ nguyên mã — vẫn hơn để trống một vế của "Trước/sau".
  assert.equal(auditStatusLabel("LA_HOAC"), "LA_HOAC");
});

test("bản ghi cũ trong DB được dịch lúc hiển thị, không đi sửa lịch sử", () => {
  // Hơn trăm dòng đã lưu sẵn câu này; sửa mã nguồn chỉ ăn vào bản ghi mới.
  assert.equal(
    auditReasonLabel("Lưu snapshot phân tích để truy vết phương án do con người xem xét"),
    "Lưu bản chụp phân tích để truy vết phương án do con người xem xét",
  );
  assert.equal(
    auditReasonLabel("AI gắn nhãn evidence hiện trường để ADMIN xem xét"),
    "AI gắn nhãn bằng chứng hiện trường để ADMIN xem xét",
  );
});

test("lý do do người dùng tự gõ thì giữ nguyên từng chữ", () => {
  // Ghi chú của cán bộ xã là bằng chứng hậu kiểm — không được sửa dù một dấu phẩy.
  const cuaNguoiDung = "Kho hết hàng, xe không chở hết chuyến đầu";
  assert.equal(auditReasonLabel(cuaNguoiDung), cuaNguoiDung);
});
