import assert from "node:assert/strict";
import test from "node:test";
import {
  WORKFLOW_STEP_COUNT,
  activeStepIndex,
  allRequestsPickedUp,
  completedStepIndex,
  type WorkflowStatus,
} from "./workflow-progress";

/** Tên bước theo đúng thứ tự hiển thị, dùng để đọc kết quả cho dễ hiểu. */
const STEP_NAME = ["điều phối", "kho", "hiện trường"] as const;

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

test("đã phát hành thì chờ kho xuất hàng", () => {
  assert.equal(waitingOn("PENDING_WAREHOUSE"), "kho");
});

test("kho xuất xong thì chờ hiện trường đi giao và báo kết quả", () => {
  assert.equal(waitingOn("READY"), "hiện trường");
});

test("hoàn thành thì không còn bước nào đang chờ", () => {
  assert.equal(completedStepIndex("COMPLETED"), WORKFLOW_STEP_COUNT - 1);
  assert.equal(waitingOn("COMPLETED"), "không chờ ai");
});

test("trạng thái luồng cũ vẫn xếp sau bước phát hành, không tụt về đầu", () => {
  // Dữ liệu lịch sử còn PENDING_RESCUE / RESCUE_CONFIRMED; xếp sai thì nhiệm vụ
  // cũ trông như chưa phát hành và điều phối tưởng mình còn việc phải làm.
  for (const status of ["PENDING_RESCUE", "RESCUE_CONFIRMED"] as WorkflowStatus[]) {
    assert.equal(completedStepIndex(status), 0, status);
  }
});

test("mọi trạng thái đều cho ra bước hợp lệ, không trỏ ra ngoài thanh", () => {
  const all: WorkflowStatus[] = [
    "DRAFT",
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
  assert.equal(completedStepIndex("READY", prepared), 0);
  assert.equal(activeStepIndex("READY", prepared), 1);

  // Đội ký nhận đủ thì bước kho mới xong, việc chuyển sang hiện trường.
  assert.equal(completedStepIndex("READY", pickedUp), 1);
  assert.equal(activeStepIndex("READY", pickedUp), 2);

  // Nhiệm vụ cũ không có phiếu nào thì không có chữ ký nào để chờ.
  assert.equal(completedStepIndex("READY", []), 1);
  assert.equal(completedStepIndex("READY"), 1);
  assert.equal(allRequestsPickedUp([]), true);
  assert.equal(allRequestsPickedUp(prepared), false);

  // Đã báo kết quả thì mọi phiếu bên dưới không đổi được gì nữa.
  assert.equal(completedStepIndex("COMPLETED", prepared), 2);
});
