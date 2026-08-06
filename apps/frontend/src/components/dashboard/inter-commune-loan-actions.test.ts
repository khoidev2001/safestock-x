import assert from "node:assert/strict";
import { test } from "node:test";

import { isOpen, loanActions, outstanding, statusLabel } from "./inter-commune-loan-actions";

const nhan = (d: "OUTGOING" | "INCOMING", s: Parameters<typeof loanActions>[1], m = false) =>
  loanActions(d, s, m).map((a) => a.to);

test("bên cho mượn quyết yêu cầu, bên đi mượn chỉ huỷ được của mình", () => {
  assert.deepEqual(nhan("OUTGOING", "REQUESTED"), ["APPROVED", "REJECTED"]);
  assert.deepEqual(nhan("INCOMING", "REQUESTED"), ["CANCELLED"]);
});

test("đã đồng ý: bên mượn xác nhận nhận, bên cho mượn thu hồi được", () => {
  assert.deepEqual(nhan("INCOMING", "APPROVED"), ["ACTIVE"]);
  assert.deepEqual(nhan("OUTGOING", "APPROVED"), ["CANCELLED"]);
});

test("đang nợ: chỉ bên đi mượn ghi trả, bên cho mượn không có nút nào", () => {
  // Bên cho mượn bấm được nút trả là bấm hộ việc của người khác, và kho họ sẽ bị
  // trừ thêm lần nữa.
  assert.deepEqual(nhan("INCOMING", "ACTIVE"), ["PARTIALLY_RETURNED"]);
  assert.deepEqual(nhan("OUTGOING", "ACTIVE"), []);
});

test("trạng thái đã đóng thì không còn nút nào", () => {
  for (const s of ["RETURNED", "REJECTED", "CANCELLED"] as const) {
    assert.deepEqual(nhan("OUTGOING", s), []);
    assert.deepEqual(nhan("INCOMING", s), []);
  }
});

test("bản ghi ghi tay: người giữ nó ghi nhận trả được ở CẢ HAI chiều", () => {
  // Không có bản ghi đối ứng ở xã kia nên họ làm thay cả hai vai. Ẩn nút ở đây
  // thì khoản mượn ghi tay không bao giờ đóng lại được.
  assert.deepEqual(nhan("OUTGOING", "ACTIVE", true), ["PARTIALLY_RETURNED"]);
  assert.deepEqual(nhan("INCOMING", "ACTIVE", true), ["PARTIALLY_RETURNED"]);
  assert.equal(loanActions("OUTGOING", "ACTIVE", true)[0].label, "Ghi nhận nhận lại");
  assert.equal(loanActions("INCOMING", "ACTIVE", true)[0].label, "Ghi nhận đã trả");
});

test("bản ghi ghi tay chưa tới lúc trả thì không có nút", () => {
  assert.deepEqual(nhan("OUTGOING", "REQUESTED", true), []);
  assert.deepEqual(nhan("OUTGOING", "RETURNED", true), []);
});

test("bước có chuyển hàng thì bắt buộc chọn lô", () => {
  // Bày nút mà không bắt chọn lô là để người dùng bấm rồi nhận lỗi từ máy chủ.
  const duyet = loanActions("OUTGOING", "REQUESTED", false).find((a) => a.to === "APPROVED")!;
  const tuChoi = loanActions("OUTGOING", "REQUESTED", false).find((a) => a.to === "REJECTED")!;

  assert.equal(duyet.needsBatch, true);
  assert.equal(tuChoi.needsBatch, false);
});

test("số còn nợ không bao giờ âm", () => {
  assert.equal(outstanding(200, 180), 20);
  assert.equal(outstanding(200, 200), 0);
  // Dữ liệu lệch thì hiện 0 chứ đừng hiện số âm — người đọc sẽ tưởng đang dư.
  assert.equal(outstanding(200, 250), 0);
});

test("mở và đóng phân biệt rõ", () => {
  assert.equal(isOpen("ACTIVE"), true);
  assert.equal(isOpen("PARTIALLY_RETURNED"), true);
  assert.equal(isOpen("RETURNED"), false);
  assert.equal(isOpen("CANCELLED"), false);
});

test("mọi trạng thái đều có nhãn tiếng Việt, không lọt mã hằng ra màn hình", () => {
  for (const s of [
    "REQUESTED",
    "APPROVED",
    "ACTIVE",
    "PARTIALLY_RETURNED",
    "RETURNED",
    "REJECTED",
    "CANCELLED",
  ] as const) {
    assert.notEqual(statusLabel(s), s);
  }
});
