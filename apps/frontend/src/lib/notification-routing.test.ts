import assert from "node:assert/strict";
import { test } from "node:test";

import {
  isStickyNotification,
  navPathForNotification,
  unreadByNavPath,
} from "./notification-routing";

test("sự cố cảm biến về tab Sự cố, việc nhiệm vụ về tab Nhiệm vụ", () => {
  assert.equal(navPathForNotification("INCIDENT_DETECTED"), "/incident");
  assert.equal(navPathForNotification("READINESS_DEGRADED"), "/incident");
  assert.equal(navPathForNotification("MISSION_ASSIGNED"), "/missions");
  assert.equal(navPathForNotification("WAREHOUSE_READY"), "/missions");
  assert.equal(navPathForNotification("INTER_WAREHOUSE_REQUEST"), "/loan");
});

test("loại lạ thì KHÔNG gắn số bừa vào tab nào", () => {
  // Thà không gắn còn hơn gắn nhầm rồi bắt người dùng đi tìm một việc không có
  // ở đó — mất lòng tin vào con số là mất luôn tác dụng của nó.
  assert.equal(navPathForNotification("MOT_LOAI_MOI_CHUA_BIET"), null);
});

test("chỉ sự cố cảm biến mới ở lại chờ người bấm", () => {
  // Mọi thẻ đều ở lại thì màn hình đầy và người ta bấm tắt theo phản xạ, đúng
  // lúc đó cái quan trọng cũng bị tắt cùng.
  assert.equal(isStickyNotification("INCIDENT_DETECTED"), true);
  assert.equal(isStickyNotification("MISSION_COMPLETED"), false);
});

test("đếm theo tab, bỏ qua thông báo đã đọc", () => {
  const counts = unreadByNavPath([
    { kind: "INCIDENT_DETECTED", read: false },
    { kind: "INCIDENT_DETECTED", read: true },
    { kind: "MISSION_ASSIGNED", read: false },
    { kind: "WAREHOUSE_READY", read: false },
    { kind: "KHONG_BIET", read: false },
  ]);

  assert.deepEqual(counts, { "/incident": 1, "/missions": 2 });
});

test("không có gì chưa đọc thì trả object rỗng", () => {
  assert.deepEqual(unreadByNavPath([{ kind: "MISSION_ASSIGNED", read: true }]), {});
  assert.deepEqual(unreadByNavPath([]), {});
});
