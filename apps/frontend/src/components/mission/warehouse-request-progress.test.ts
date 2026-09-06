import assert from "node:assert/strict";
import { test } from "node:test";

import { planBulkAction, warehouseProgress, type RequestLike } from "./warehouse-request-progress";

const yc = (warehouseId: string, name: string, status: string): RequestLike => ({
  warehouseId,
  warehouse: { name },
  status,
});

test("tách tiến độ theo từng kho thay vì một con số gộp", () => {
  // "1/5" không trả lời được câu hỏi duy nhất điều phối cần hỏi lúc đang chờ:
  // kho nào xong rồi, kho nào chưa, để còn gọi đúng nơi.
  const result = warehouseProgress([
    yc("w1", "Kho trung tâm", "PREPARED"),
    yc("w1", "Kho trung tâm", "PREPARED"),
    yc("w2", "Kho thôn Long Châu", "PENDING"),
    yc("w2", "Kho thôn Long Châu", "PENDING"),
    yc("w2", "Kho thôn Long Châu", "PREPARED"),
  ]);

  assert.deepEqual(
    result.map((r) => `${r.name} ${r.prepared}/${r.total}`),
    ["Kho thôn Long Châu 1/3", "Kho trung tâm 2/2"],
  );
});

test("kho CHƯA xong xếp lên trước — đó mới là việc phải làm", () => {
  const result = warehouseProgress([
    // XONG nghĩa là ĐỘI ĐÃ KÝ NHẬN, nên phải dùng PICKED_UP. Trước đây dùng
    // PREPARED vì lúc đó "kho xuất xong" bị coi là hết việc — không đúng.
    yc("w1", "A xong", "PICKED_UP"),
    yc("w2", "Z chưa xong", "PENDING"),
  ]);

  assert.equal(result[0].name, "Z chưa xong");
  assert.equal(result[0].done, false);
  assert.equal(result[1].done, true);
});

test("cùng trạng thái thì xếp theo tên, ổn định giữa các lần tải lại", () => {
  const result = warehouseProgress([yc("w2", "Tân Bình", "PENDING"), yc("w1", "Long Châu", "PENDING")]);

  assert.deepEqual(
    result.map((r) => r.name),
    ["Long Châu", "Tân Bình"],
  );
});

test("kho thiếu tên vẫn hiện được, không ra chuỗi rỗng", () => {
  const result = warehouseProgress([{ warehouseId: "w9", warehouse: null, status: "PENDING" }]);

  assert.equal(result[0].name, "Kho chưa đặt tên");
});

test("danh sách rỗng trả mảng rỗng", () => {
  assert.deepEqual(warehouseProgress([]), []);
});

test("kho XUẤT XONG nhưng đội chưa lấy thì CHƯA xong", () => {
  // Đây là luật quan trọng nhất của khối này. Hàng ra sân kho mà chưa ai tới lấy
  // thì việc chưa xong — người cần vẫn chưa có. Bật xong ở bước xuất là báo cho
  // điều phối một tin mừng chưa xảy ra, và họ thôi không gọi nhắc nữa.
  const result = warehouseProgress([
    { warehouseId: "k1", warehouse: { name: "Kho A" }, status: "PREPARED" },
    { warehouseId: "k1", warehouse: { name: "Kho A" }, status: "PREPARED" },
  ]);

  assert.equal(result[0].prepared, 2);
  assert.equal(result[0].pickedUp, 0);
  assert.equal(result[0].done, false);
  assert.equal(result[0].awaitingPickup, true);
});

test("đội ký nhận ĐỦ thì mới XONG", () => {
  const result = warehouseProgress([
    { warehouseId: "k1", warehouse: { name: "Kho A" }, status: "PICKED_UP" },
    { warehouseId: "k1", warehouse: { name: "Kho A" }, status: "PICKED_UP" },
  ]);

  assert.equal(result[0].pickedUp, 2);
  assert.equal(result[0].done, true);
  assert.equal(result[0].awaitingPickup, false);
});

test("đội mới lấy một phần thì vẫn CHƯA xong", () => {
  const result = warehouseProgress([
    { warehouseId: "k1", warehouse: { name: "Kho A" }, status: "PICKED_UP" },
    { warehouseId: "k1", warehouse: { name: "Kho A" }, status: "PREPARED" },
  ]);

  assert.equal(result[0].done, false);
  assert.equal(result[0].awaitingPickup, true);
});

test("kho chưa xuất xong thì KHÔNG phải trạng thái chờ lấy", () => {
  // Phân biệt "chưa xuất xong" với "xuất xong, chờ lấy" — hai việc phải gọi hai
  // người khác nhau: một bên gọi kho, một bên gọi đội.
  const result = warehouseProgress([
    { warehouseId: "k1", warehouse: { name: "Kho A" }, status: "ACCEPTED" },
    { warehouseId: "k1", warehouse: { name: "Kho A" }, status: "PREPARED" },
  ]);

  assert.equal(result[0].done, false);
  assert.equal(result[0].awaitingPickup, false);
});

// ===== Ba nút làm cả loạt: tiếp nhận → xuất → ký nhận =====

const row = (id: string, status: string, preparedQuantity = 10) => ({
  id,
  status,
  preparedQuantity,
});
const noQuantityInput = () => "";

test("còn dòng chưa tiếp nhận thì chỉ hiện tiếp nhận, chưa nói tới xuất", () => {
  const plan = planBulkAction(
    [row("a", "PENDING"), row("b", "ACCEPTED"), row("c", "PREPARED")],
    noQuantityInput,
  );

  assert.equal(plan.kind, "accept");
  assert.deepEqual(
    plan.rows.map((r) => r.id),
    ["a"],
  );
});

test("tiếp nhận hết rồi mới lộ ra nút xuất", () => {
  const plan = planBulkAction([row("a", "ACCEPTED"), row("b", "ACCEPTED")], noQuantityInput);

  assert.equal(plan.kind, "prepare");
  assert.equal(plan.rows.length, 2);
});

test("xuất hết rồi mới lộ ra nút ký nhận", () => {
  const plan = planBulkAction([row("a", "PREPARED"), row("b", "PREPARED")], noQuantityInput);

  assert.equal(plan.kind, "pickup");
  assert.equal(plan.rows.length, 2);
});

test("ký nhận xong hết thì không còn nút nào", () => {
  const plan = planBulkAction([row("a", "PICKED_UP"), row("b", "PICKED_UP")], noQuantityInput);

  assert.equal(plan.kind, null);
  assert.deepEqual(plan.rows, []);
});

test("bỏ trống ô số nghĩa là lấy đủ, vẫn ký gộp được", () => {
  const plan = planBulkAction([row("a", "PREPARED", 10)], (r) => (r.id === "a" ? "  " : ""));

  assert.equal(plan.kind, "pickup");
  assert.equal(plan.partialPickupCount, 0);
});

test("gõ đúng số đã soạn cũng là lấy đủ", () => {
  const plan = planBulkAction([row("a", "PREPARED", 10)], () => "10");

  assert.equal(plan.kind, "pickup");
  assert.equal(plan.partialPickupCount, 0);
});

test("dòng khai lấy THIẾU bị loại khỏi ký gộp, và được đếm riêng để nói ra", () => {
  // Ký gộp cho một khoản hàng chưa nhận được là ký khống — mà chữ ký đó chính là
  // bằng chứng đối chiếu về sau.
  const plan = planBulkAction(
    [row("a", "PREPARED", 10), row("b", "PREPARED", 10)],
    (r) => (r.id === "b" ? "7" : ""),
  );

  assert.equal(plan.kind, "pickup");
  assert.deepEqual(
    plan.rows.map((r) => r.id),
    ["a"],
  );
  assert.equal(plan.partialPickupCount, 1);
});

test("mọi dòng đều khai thiếu thì không có nút ký gộp nào", () => {
  const plan = planBulkAction([row("a", "PREPARED", 10)], () => "3");

  assert.equal(plan.kind, null);
  assert.equal(plan.partialPickupCount, 1);
});

test("không có dòng nào của kho mình thì không hiện nút", () => {
  assert.equal(planBulkAction([], noQuantityInput).kind, null);
});
