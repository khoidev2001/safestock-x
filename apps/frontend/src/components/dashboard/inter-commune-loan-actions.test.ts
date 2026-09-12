import assert from "node:assert/strict";
import { test } from "node:test";

import { isLoanOpen, isOpen, loanActions, outstanding, statusLabel } from "./inter-commune-loan-actions";

const actionsFor = (d: "OUTGOING" | "INCOMING", s: Parameters<typeof loanActions>[1], m = false) =>
  loanActions(d, s, m).map((a) => a.to);

test("bên cho mượn quyết yêu cầu, bên đi mượn chỉ huỷ được của mình", () => {
  assert.deepEqual(actionsFor("OUTGOING", "REQUESTED"), ["APPROVED", "REJECTED"]);
  assert.deepEqual(actionsFor("INCOMING", "REQUESTED"), ["CANCELLED"]);
});

test("đã đồng ý: bên mượn xác nhận nhận, bên cho mượn thu hồi được", () => {
  assert.deepEqual(actionsFor("INCOMING", "APPROVED"), ["ACTIVE"]);
  assert.deepEqual(actionsFor("OUTGOING", "APPROVED"), ["CANCELLED"]);
});

test("đang nợ: chỉ bên đi mượn ghi trả, bên cho mượn không có nút nào", () => {
  // Bên cho mượn bấm được nút trả là bấm hộ việc của người khác, và kho họ sẽ bị
  // trừ thêm lần nữa.
  assert.deepEqual(actionsFor("INCOMING", "ACTIVE"), ["PARTIALLY_RETURNED"]);
  assert.deepEqual(actionsFor("OUTGOING", "ACTIVE"), []);
});

test("trạng thái đã đóng thì không còn nút nào", () => {
  for (const s of ["RETURNED", "REJECTED", "CANCELLED"] as const) {
    assert.deepEqual(actionsFor("OUTGOING", s), []);
    assert.deepEqual(actionsFor("INCOMING", s), []);
  }
});

test("bản ghi ghi tay: người giữ nó ghi nhận trả được ở CẢ HAI chiều", () => {
  // Không có bản ghi đối ứng ở xã kia nên họ làm thay cả hai vai. Ẩn nút ở đây
  // thì khoản mượn ghi tay không bao giờ đóng lại được.
  assert.deepEqual(actionsFor("OUTGOING", "ACTIVE", true), ["PARTIALLY_RETURNED"]);
  assert.deepEqual(actionsFor("INCOMING", "ACTIVE", true), ["PARTIALLY_RETURNED"]);
  assert.equal(loanActions("OUTGOING", "ACTIVE", true)[0].label, "Ghi nhận nhận lại");
  assert.equal(loanActions("INCOMING", "ACTIVE", true)[0].label, "Ghi nhận đã trả");
});

test("bản ghi ghi tay chưa tới lúc trả thì không có nút", () => {
  assert.deepEqual(actionsFor("OUTGOING", "REQUESTED", true), []);
  assert.deepEqual(actionsFor("OUTGOING", "RETURNED", true), []);
});

test("chỉ bước thật sự đụng kho mới được đánh dấu là chuyển hàng", () => {
  // Nhãn này là thứ giao diện dùng để cảnh báo trước khi bấm. Đánh dấu bừa cho
  // cả nút "Từ chối" thì lời cảnh báo hiện ở mọi nút, và người dùng thôi đọc nó.
  const approve = loanActions("OUTGOING", "REQUESTED", false).find((a) => a.to === "APPROVED")!;
  const reject = loanActions("OUTGOING", "REQUESTED", false).find((a) => a.to === "REJECTED")!;

  assert.equal(approve.movesStock, true);
  assert.equal(reject.movesStock, false);
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

test("khoản đã trả xong nhưng bên cho mượn chưa xác nhận thì VẪN đang mở", () => {
  // Trạng thái nói bên MƯỢN đã trả tới đâu; hàng còn trên đường thì bên cho mượn
  // vẫn phải thấy khoản này, nếu không nút xác nhận biến mất và hàng mắc kẹt.
  const daTraChuaNhan = {
    status: "RETURNED" as const,
    direction: "OUTGOING" as const,
    returnedQuantity: 40,
    returnAcceptedQuantity: 15,
  };
  assert.equal(isLoanOpen(daTraChuaNhan), true);
  assert.equal(isLoanOpen({ ...daTraChuaNhan, returnAcceptedQuantity: 40 }), false);
  // Bên đi mượn thì trả xong là xong, không có gì để nhận lại.
  assert.equal(isLoanOpen({ ...daTraChuaNhan, direction: "INCOMING" }), false);
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
