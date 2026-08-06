import assert from "node:assert/strict";
import test from "node:test";
import { enqueueOperation, getPendingOperations } from "../src/renderer/lib/simulator-queue";

/**
 * Hàng chờ cục bộ không được nuốt số liệu.
 *
 * Lỗi đã xảy ra thật: backend trả khoá `id` còn app đọc `user.userId`, nên mỗi lô
 * xác nhận được ghi với ownerUserId rỗng. Ghi thì thành công, nhưng lượt đọc kế
 * tiếp lọc bỏ vì không qua kiểm tra — vòng gửi chạy trên danh sách rỗng, không
 * lỗi, không log, số liệu biến mất không dấu vết.
 */
function fakeLocalStorage() {
  const store = new Map<string, string>();
  (globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    },
  };
}

const SNAPSHOT = {
  kind: "snapshot" as const,
  idempotencyKey: "snapshot-1",
  ownerUserId: "user-1",
  warehouseId: "warehouse-1",
  observedAt: "2026-08-03T12:00:00.000Z",
  policyVersion: null,
  readings: [{ deviceCode: "temp_A", value: 30 }],
};

test("lô hợp lệ ghi vào rồi đọc lại được", () => {
  fakeLocalStorage();
  assert.equal(enqueueOperation(SNAPSHOT), true);
  assert.equal(getPendingOperations("user-1", "warehouse-1").length, 1);
});

test("thiếu ownerUserId thì TỪ CHỐI ngay, không ghi rồi mất im lặng", () => {
  fakeLocalStorage();
  const broken = { ...SNAPSHOT, ownerUserId: undefined as unknown as string };

  assert.equal(enqueueOperation(broken), false);
  // Không có gì lọt vào hàng chờ: người dùng nhận báo lỗi thay vì tưởng đã gửi.
  assert.equal(getPendingOperations("user-1", "warehouse-1").length, 0);
});

test("đọc theo đúng chủ sở hữu và kho, không lẫn của tài khoản khác", () => {
  fakeLocalStorage();
  enqueueOperation(SNAPSHOT);
  enqueueOperation({ ...SNAPSHOT, idempotencyKey: "snapshot-2", ownerUserId: "user-2" });

  assert.equal(getPendingOperations("user-1", "warehouse-1").length, 1);
  assert.equal(getPendingOperations("user-2", "warehouse-1").length, 1);
  assert.equal(getPendingOperations("user-1", "warehouse-khac").length, 0);
});
