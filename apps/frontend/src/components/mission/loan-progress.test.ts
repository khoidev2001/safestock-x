import assert from "node:assert/strict";
import test from "node:test";
import {
  attemptsSummary,
  isLoanInFlight,
  loanLine,
  loanStage,
  sortByStage,
  type LoanLike,
} from "./loan-progress";

function loan(overrides: Partial<LoanLike> = {}): LoanLike {
  return {
    id: "loan-1",
    direction: "INCOMING",
    status: "REQUESTED",
    peerCommuneName: "Xuân Thọ",
    peerLoanId: null,
    peerDeliveryError: null,
    rejectReason: null,
    itemSku: "LIFE-ADULT",
    unit: "chiếc",
    quantity: 5,
    ...overrides,
  };
}

test("vừa bấm gửi thì là ĐANG GỬI, không phải lỗi", () => {
  // Lỗi cũ: `peerLoanId` rỗng bị đọc thành "xã kia CHƯA nhận được", nên mọi yêu
  // cầu vừa bấm đều hiện đỏ vài giây rồi tự đổi sang "chờ đồng ý".
  const fresh = loan();
  assert.equal(loanStage(fresh), "SENDING");
  const line = loanLine(fresh);
  assert.equal(line.tone, "muted");
  assert.equal(line.action, undefined);
  assert.match(line.text, /Đang gửi/);
});

test("chỉ báo chưa gửi được khi máy chủ ĐÃ ghi nhận là hỏng", () => {
  const failed = loan({ peerDeliveryError: "Không liên lạc được với máy chủ xã Xuân Thọ." });
  assert.equal(loanStage(failed), "UNDELIVERED");
  const line = loanLine(failed);
  assert.equal(line.tone, "critical");
  assert.equal(line.action, "RESEND");
});

test("gửi tới nơi rồi thì chờ xã kia, và không còn bày nút gửi lại", () => {
  const delivered = loan({ peerLoanId: "peer-1" });
  assert.equal(loanStage(delivered), "AWAITING_PEER");
  assert.equal(loanLine(delivered).action, undefined);
  assert.match(loanLine(delivered).text, /đã nhận được yêu cầu/);
});

test("gửi lại thành công thì lỗi cũ không được giữ lại", () => {
  // Máy chủ xoá `peerDeliveryError` cùng lúc ghi `peerLoanId`; nếu quên thì dòng
  // đỏ nằm lại vĩnh viễn dù đã gửi được.
  const resent = loan({ peerLoanId: "peer-1", peerDeliveryError: null });
  assert.equal(loanStage(resent), "AWAITING_PEER");
});

test("xã kia ĐỒNG Ý chưa phải là hàng đã về kho", () => {
  // Lỗi cũ: ghi "mượn thành công 5 chiếc" trong khi bảng vật tư vẫn ghi thiếu 5.
  const agreed = loan({ status: "APPROVED", peerLoanId: "peer-1" });
  assert.equal(loanStage(agreed), "PEER_AGREED");
  const line = loanLine(agreed);
  assert.match(line.text, /ĐÃ ĐỒNG Ý/);
  assert.match(line.text, /chưa về kho/i);
  // Bước kế tiếp là việc CỦA MÌNH nên phải có nút ngay tại dòng.
  assert.equal(line.action, "CONFIRM_RECEIVED");
});

test("nhận hàng xong mới được nói là đã cộng vào kho", () => {
  const received = loan({ status: "ACTIVE", peerLoanId: "peer-1" });
  assert.equal(loanStage(received), "RECEIVED");
  assert.equal(loanLine(received).tone, "ready");
  assert.match(loanLine(received).text, /đã cộng vào kho/);
});

test("việc cần mình bấm xếp lên trước việc đã đóng", () => {
  // Đúng cảnh hình 3: hỏi ba xã, ba dòng xếp lẫn lộn theo thứ tự cơ sở dữ liệu.
  const rows = [
    loan({ id: "tu-choi", status: "REJECTED" }),
    loan({ id: "cho-tra-loi", peerLoanId: "p1" }),
    loan({ id: "chua-gui-duoc", peerDeliveryError: "hỏng mạng" }),
    loan({ id: "da-dong-y", status: "APPROVED", peerLoanId: "p2" }),
  ];
  assert.deepEqual(
    sortByStage(rows).map((row) => row.id),
    ["chua-gui-duoc", "da-dong-y", "cho-tra-loi", "tu-choi"],
  );
});

test("hỏi nhiều xã thì có một câu tóm tắt đứng trên", () => {
  const summary = attemptsSummary([
    loan({ id: "a", status: "APPROVED", peerLoanId: "p1" }),
    loan({ id: "b", peerLoanId: "p2" }),
    loan({ id: "c", status: "REJECTED" }),
  ]);
  assert.equal(
    summary,
    "Đã hỏi 3 xã: 1 xã đã đồng ý, chờ nhận hàng · 1 xã đang chờ trả lời · 1 xã từ chối.",
  );
});

test("hỏi đúng một xã thì không cần tóm tắt", () => {
  assert.equal(attemptsSummary([loan()]), null);
});

test("chỉ hỏi lại máy chủ khi còn bước đang chạy", () => {
  assert.equal(isLoanInFlight(loan()), true);
  assert.equal(isLoanInFlight(loan({ peerLoanId: "p1" })), true);
  assert.equal(isLoanInFlight(loan({ status: "APPROVED", peerLoanId: "p1" })), true);
  // Đã đóng sổ thì thôi: nuôi vòng lặp gọi mạng cho chúng là tốn pin không đổi
  // lấy gì.
  assert.equal(isLoanInFlight(loan({ status: "ACTIVE" })), false);
  assert.equal(isLoanInFlight(loan({ status: "REJECTED" })), false);
  assert.equal(isLoanInFlight(loan({ status: "CANCELLED" })), false);
  // Chưa gửi được thì cũng không tự hết: phải có người bấm gửi lại.
  assert.equal(isLoanInFlight(loan({ peerDeliveryError: "hỏng mạng" })), false);
});
