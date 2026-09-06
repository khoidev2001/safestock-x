import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

import { maySessionExist, markSessionPresent, clearSessionMarker } from "./session-marker";

function fakeStorage(broken = false) {
  const store = new Map<string, string>();
  (globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem: (k: string) => {
        if (broken) throw new Error("bi chan");
        return store.get(k) ?? null;
      },
      setItem: (k: string, v: string) => {
        if (broken) throw new Error("bi chan");
        store.set(k, v);
      },
      removeItem: (k: string) => {
        if (broken) throw new Error("bi chan");
        store.delete(k);
      },
    },
  };
}

beforeEach(() => fakeStorage());

test("chưa đăng nhập lần nào thì KHÔNG khôi phục phiên", () => {
  // Đây là cả lý do tồn tại của module: gọi khôi phục lúc này chỉ nhận 401 và in
  // một dòng đỏ trong Console, làm người xem tưởng app đang hỏng.
  assert.equal(maySessionExist(), false);
});

test("đăng nhập xong thì lần mở trang sau mới thử khôi phục", () => {
  markSessionPresent();

  assert.equal(maySessionExist(), true);
});

test("đăng xuất thì xoá dấu", () => {
  markSessionPresent();
  clearSessionMarker();

  assert.equal(maySessionExist(), false);
});

test("chạy phía máy chủ (không có window) không được ném", () => {
  delete (globalThis as { window?: unknown }).window;

  assert.equal(maySessionExist(), false);
  assert.doesNotThrow(() => markSessionPresent());
  assert.doesNotThrow(() => clearSessionMarker());
});

test("trình duyệt chặn lưu trữ thì vẫn thử khôi phục, không đá người đang đăng nhập ra", () => {
  // Thà thừa một lượt gọi mạng còn hơn buộc người có phiên hợp lệ đăng nhập lại.
  fakeStorage(true);

  assert.equal(maySessionExist(), true);
  assert.doesNotThrow(() => markSessionPresent());
  assert.doesNotThrow(() => clearSessionMarker());
});
