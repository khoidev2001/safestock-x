import assert from "node:assert/strict";
import { test } from "node:test";

import { warehouseProgress, type RequestLike } from "./warehouse-request-progress";

const yc = (warehouseId: string, name: string, status: string): RequestLike => ({
  warehouseId,
  warehouse: { name },
  status,
});

test("tách tiến độ theo từng kho thay vì một con số gộp", () => {
  // "1/5" không trả lời được câu hỏi duy nhất điều phối cần hỏi lúc đang chờ:
  // kho nào xong rồi, kho nào chưa, để còn gọi đúng nơi.
  const ra = warehouseProgress([
    yc("w1", "Kho trung tâm", "PREPARED"),
    yc("w1", "Kho trung tâm", "PREPARED"),
    yc("w2", "Kho thôn Long Châu", "PENDING"),
    yc("w2", "Kho thôn Long Châu", "PENDING"),
    yc("w2", "Kho thôn Long Châu", "PREPARED"),
  ]);

  assert.deepEqual(
    ra.map((r) => `${r.name} ${r.prepared}/${r.total}`),
    ["Kho thôn Long Châu 1/3", "Kho trung tâm 2/2"],
  );
});

test("kho CHƯA xong xếp lên trước — đó mới là việc phải làm", () => {
  const ra = warehouseProgress([
    yc("w1", "A xong", "PREPARED"),
    yc("w2", "Z chưa xong", "PENDING"),
  ]);

  assert.equal(ra[0].name, "Z chưa xong");
  assert.equal(ra[0].done, false);
  assert.equal(ra[1].done, true);
});

test("cùng trạng thái thì xếp theo tên, ổn định giữa các lần tải lại", () => {
  const ra = warehouseProgress([yc("w2", "Tân Bình", "PENDING"), yc("w1", "Long Châu", "PENDING")]);

  assert.deepEqual(
    ra.map((r) => r.name),
    ["Long Châu", "Tân Bình"],
  );
});

test("kho thiếu tên vẫn hiện được, không ra chuỗi rỗng", () => {
  const ra = warehouseProgress([{ warehouseId: "w9", warehouse: null, status: "PENDING" }]);

  assert.equal(ra[0].name, "Kho chưa đặt tên");
});

test("danh sách rỗng trả mảng rỗng", () => {
  assert.deepEqual(warehouseProgress([]), []);
});

test("kho đã có người ký nhận vẫn tính là XONG", () => {
  // Lỗi đã suýt lọt: thêm trạng thái PICKED_UP nhưng vẫn chỉ đếm PREPARED, nên
  // kho vừa soạn xong lại lùi về "chưa xong" ngay lúc người lấy hàng ký tên.
  const ra = warehouseProgress([
    { warehouseId: "k1", warehouse: { name: "Kho A" }, status: "PREPARED" },
    { warehouseId: "k1", warehouse: { name: "Kho A" }, status: "PICKED_UP" },
  ]);

  assert.equal(ra[0].prepared, 2);
  assert.equal(ra[0].done, true);
});
