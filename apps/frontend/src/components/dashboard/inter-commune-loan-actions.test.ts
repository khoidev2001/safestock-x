import assert from "node:assert/strict";
import { test } from "node:test";

import {
  isLoanOpen,
  isOpen,
  loanActions,
  outstanding,
  peerDeliveryNotice,
  sortByAttention,
  statusLabel,
  waitingOnMe,
} from "./inter-commune-loan-actions";

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

/*
  Tin báo "đã sang tới xã kia chưa".

  Chốt giữ một báo động giả có thật: lần gửi đầu tiên chạy nền, nên ngay sau khi
  bấm thì `peerLoanId` còn rỗng mà chưa hỏng gì. Màn hình từng hét "chưa gửi
  được" đúng lúc ấy rồi tự hết.
*/
const loanState = (over: Partial<Parameters<typeof peerDeliveryNotice>[0]> = {}) => ({
  direction: "INCOMING" as const,
  status: "REQUESTED" as const,
  peerLoanId: null,
  peerDeliveryError: null,
  ...over,
});

test("đang gửi thì báo đang gửi, chưa được coi là hỏng", () => {
  assert.equal(peerDeliveryNotice(loanState()), "sending");
});

test("chỉ báo hỏng khi máy chủ đã ghi lý do hỏng", () => {
  assert.equal(
    peerDeliveryNotice(loanState({ peerDeliveryError: "Không liên lạc được với máy chủ xã Xuân Thọ." })),
    "failed",
  );
});

test("gửi tới nơi rồi thì im lặng, kể cả khi lý do hỏng cũ còn sót", () => {
  assert.equal(peerDeliveryNotice(loanState({ peerLoanId: "peer-1" })), "none");
  // Máy chủ xoá `peerDeliveryError` cùng lúc ghi `peerLoanId`, nhưng đừng phụ
  // thuộc vào điều đó: có id bên kia là đã tới nơi.
  assert.equal(
    peerDeliveryNotice(loanState({ peerLoanId: "peer-1", peerDeliveryError: "hỏng cũ" })),
    "none",
  );
});

test("khoản cho mượn và khoản đã quyết đều không báo gì", () => {
  // Bản ghi OUTGOING sinh ra từ chính lời gọi của xã kia — không có chuyện chưa gửi tới.
  assert.equal(peerDeliveryNotice(loanState({ direction: "OUTGOING" })), "none");
  assert.equal(peerDeliveryNotice(loanState({ status: "APPROVED" })), "none");
  assert.equal(peerDeliveryNotice(loanState({ status: "CANCELLED" })), "none");
});

/*
  Thứ tự sổ mượn: việc của mình lên đầu.

  Dựng lại đúng màn hình đã gặp: ba khoản "chờ bên kia quyết" không làm gì được,
  và một khoản đã được đồng ý đang chờ mình bấm nhận hàng — khoản ấy từng bị đẩy
  xuống cuối vì máy chủ gom theo trạng thái.
*/
const book = (over: Partial<Parameters<typeof waitingOnMe>[0] & { requestedAt: string }> = {}) => ({
  direction: "INCOMING" as const,
  status: "REQUESTED" as const,
  recordedManually: false,
  returnedQuantity: 0,
  returnAcceptedQuantity: 0,
  requestedAt: "2026-09-13T02:00:00.000Z",
  ...over,
});

test("bên cho mượn phải quyết, bên đi mượn chỉ chờ — cùng một trạng thái REQUESTED", () => {
  assert.equal(waitingOnMe(book({ direction: "OUTGOING" })), true);
  assert.equal(waitingOnMe(book({ direction: "INCOMING" })), false);
});

test("đã đồng ý thì tới lượt bên đi mượn nhận hàng", () => {
  assert.equal(waitingOnMe(book({ status: "APPROVED", direction: "INCOMING" })), true);
  assert.equal(waitingOnMe(book({ status: "APPROVED", direction: "OUTGOING" })), false);
});

test("bên cho mượn chưa xác nhận cầm lại đủ thì vẫn là việc của mình, kể cả khi sổ ghi đã trả xong", () => {
  const chuaNhanDu = book({
    direction: "OUTGOING",
    status: "RETURNED",
    returnedQuantity: 25,
    returnAcceptedQuantity: 0,
  });
  assert.equal(waitingOnMe(chuaNhanDu), true);
  assert.equal(waitingOnMe({ ...chuaNhanDu, returnAcceptedQuantity: 25 }), false);
});

test("khoản ghi tay: người giữ sổ làm cả hai vai nên còn nợ là còn việc", () => {
  assert.equal(waitingOnMe(book({ recordedManually: true, status: "ACTIVE" })), true);
  assert.equal(waitingOnMe(book({ recordedManually: true, status: "REQUESTED" })), false);
});

test("khoản chờ mình nhận hàng phải đứng trên ba khoản chờ bên kia quyết", () => {
  const canNuoc = book({ status: "APPROVED", requestedAt: "2026-09-13T02:51:00.000Z" });
  const boPin = book({ requestedAt: "2026-09-13T02:49:00.000Z" });
  const gao = book({ requestedAt: "2026-09-13T02:33:00.000Z" });
  const bat = book({ requestedAt: "2026-09-12T15:56:00.000Z" });

  const xepLai = sortByAttention([boPin, gao, bat, canNuoc]);
  assert.deepEqual(
    xepLai.map((l) => l.requestedAt),
    [canNuoc.requestedAt, boPin.requestedAt, gao.requestedAt, bat.requestedAt],
  );
});

test("trong cùng một nhóm vẫn giữ mới nhất lên đầu", () => {
  const cu = book({ requestedAt: "2026-09-10T00:00:00.000Z" });
  const moi = book({ requestedAt: "2026-09-13T00:00:00.000Z" });
  assert.deepEqual(
    sortByAttention([cu, moi]).map((l) => l.requestedAt),
    [moi.requestedAt, cu.requestedAt],
  );
});

test("sắp xếp không đụng vào mảng gốc", () => {
  // Mảng đến từ React state; `sort` gốc là đột biến nên phải chép trước.
  const goc = [book({ requestedAt: "2026-09-10T00:00:00.000Z" }), book({ status: "APPROVED" })];
  const truoc = goc.map((l) => l.requestedAt);
  sortByAttention(goc);
  assert.deepEqual(goc.map((l) => l.requestedAt), truoc);
});
