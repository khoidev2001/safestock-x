import assert from "node:assert/strict";
import test from "node:test";
import {
  WORKFLOW_STEP_COUNT,
  activeStepIndex,
  allRequestsPickedUp,
  completedStepIndex,
  completionLabel,
  type WorkflowStatus,
} from "./workflow-progress";

/** Tên bước theo đúng thứ tự hiển thị, dùng để đọc kết quả cho dễ hiểu. */
const STEP_NAME = ["điều phối", "hiện trường chốt số", "kho", "hiện trường giao", "hoàn trả"] as const;

function waitingOn(status: WorkflowStatus): string {
  const index = activeStepIndex(status);
  return index === null ? "không chờ ai" : STEP_NAME[index];
}

test("nhiệm vụ vừa lập thì chờ chính điều phối phát hành", () => {
  // Lỗi cũ: DRAFT bị coi là điều phối đã xong, "Đang chờ" nhảy sang hiện trường
  // nên người dùng ngồi đợi một bước không bao giờ tới.
  assert.equal(completedStepIndex("DRAFT"), -1);
  assert.equal(waitingOn("DRAFT"), "điều phối");
});

test("gửi bản tham mưu rồi thì chờ hiện trường chốt số", () => {
  assert.equal(completedStepIndex("PENDING_FIELD_DECISION"), 0);
  assert.equal(waitingOn("PENDING_FIELD_DECISION"), "hiện trường chốt số");
});

test("hiện trường chốt xong thì việc quay lại tay điều phối", () => {
  // Đây là lúc ADMIN phải bấm lập kế hoạch rồi phát hành. Chỉ sai một bước ở đây
  // là hai bên cùng ngồi đợi nhau.
  assert.equal(completedStepIndex("FIELD_DECIDED"), 1);
  assert.equal(waitingOn("FIELD_DECIDED"), "kho");
});

test("đã phát hành thì chờ kho xuất hàng", () => {
  assert.equal(waitingOn("PENDING_WAREHOUSE"), "kho");
});

test("kho xuất xong thì chờ hiện trường đi giao và báo kết quả", () => {
  assert.equal(waitingOn("READY"), "hiện trường giao");
});

test("đóng nhiệm vụ mà còn nợ vật tư thì bước hoàn trả chưa xong", () => {
  // Tick xanh lúc này là xoá khỏi màn hình đúng khoản duy nhất còn treo.
  assert.equal(completedStepIndex("COMPLETED", null, true), 3);
  assert.equal(activeStepIndex("COMPLETED", null, true), 4);
});

test("hoàn thành và đã trả hết thì không còn bước nào đang chờ", () => {
  assert.equal(completedStepIndex("COMPLETED"), WORKFLOW_STEP_COUNT - 1);
  assert.equal(waitingOn("COMPLETED"), "không chờ ai");
});

test("chữ trên thẻ nói đúng ba tình huống sau khi đóng nhiệm vụ", () => {
  assert.match(completionLabel({ heldCount: 2, transferredCount: 0 }), /chưa hoàn trả/);
  assert.match(completionLabel({ heldCount: 0, transferredCount: 0 }), /đã hoàn trả/);
  // Chuyển sang nhiệm vụ khác KHÔNG phải là đã trả: hàng vẫn ở ngoài kho.
  assert.match(completionLabel({ heldCount: 0, transferredCount: 1 }), /chuyển vật tư sang/);
});

test("trạng thái luồng cũ vẫn xếp sau bước phát hành, không tụt về đầu", () => {
  // Dữ liệu lịch sử còn PENDING_RESCUE / RESCUE_CONFIRMED; xếp sai thì nhiệm vụ
  // cũ trông như chưa phát hành và điều phối tưởng mình còn việc phải làm.
  for (const status of ["PENDING_RESCUE", "RESCUE_CONFIRMED"] as WorkflowStatus[]) {
    assert.equal(completedStepIndex(status), 1, status);
  }
});

test("mọi trạng thái đều cho ra bước hợp lệ, không trỏ ra ngoài thanh", () => {
  const all: WorkflowStatus[] = [
    "DRAFT",
    "PENDING_FIELD_DECISION",
    "FIELD_DECIDED",
    "PENDING_WAREHOUSE",
    "READY",
    "COMPLETED",
    "PENDING_RESCUE",
    "RESCUE_CONFIRMED",
    "REJECTED",
    "DEFERRED",
    "CANCELLED",
  ];
  for (const status of all) {
    const done = completedStepIndex(status);
    assert.ok(done >= -1 && done < WORKFLOW_STEP_COUNT, status);
    const active = activeStepIndex(status);
    assert.ok(active === null || (active >= 0 && active < WORKFLOW_STEP_COUNT), status);
  }
});

test("kho soạn xong chưa phải là kho đã giao xong", () => {
  const prepared = [{ status: "PREPARED" }, { status: "PICKED_UP" }];
  const pickedUp = [{ status: "PICKED_UP" }, { status: "PICKED_UP" }];

  // READY chỉ nói mọi kho đã SOẠN xong. Còn món nằm trên sân kho chờ đội tới ký
  // nhận thì bước kho CHƯA xong — tick xanh lúc này là báo tin mừng chưa xảy ra,
  // điều phối thôi không gọi nhắc trong khi hàng vẫn nằm ở kho thôn.
  assert.equal(completedStepIndex("READY", prepared), 1);
  assert.equal(activeStepIndex("READY", prepared), 2);

  // Đội ký nhận đủ thì bước kho mới xong, việc chuyển sang hiện trường.
  assert.equal(completedStepIndex("READY", pickedUp), 2);
  assert.equal(activeStepIndex("READY", pickedUp), 3);

  // Nhiệm vụ bỏ qua chặng kho không có phiếu nào, và nhiệm vụ cũ cũng vậy —
  // không có chữ ký nào để chờ thì không được treo bước kho vĩnh viễn.
  assert.equal(completedStepIndex("READY", []), 2);
  assert.equal(completedStepIndex("READY"), 2);
  assert.equal(allRequestsPickedUp([]), true);
  assert.equal(allRequestsPickedUp(prepared), false);

  // Đã báo kết quả thì mọi phiếu bên dưới không đổi được gì nữa.
  assert.equal(completedStepIndex("COMPLETED", prepared), 4);
});
