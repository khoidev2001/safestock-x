import assert from "node:assert/strict";
import { test } from "node:test";

import { describeSuppressedIncidents, type SuppressedIncident } from "./suppressed-incidents";

const badStorageOnTempA: SuppressedIncident = {
  kind: "BAD_STORAGE",
  title: "Điều kiện bảo quản không đạt",
  deviceCode: "temp_A",
  openIncidentId: "inc-1",
  openIncidentTitle: "Điều kiện bảo quản không đạt",
};

test("không có gì bị chặn thì im lặng", () => {
  assert.equal(describeSuppressedIncidents([]), null);
  // Máy chủ cũ chưa trả trường này: không được làm vỡ luồng gửi.
  assert.equal(describeSuppressedIncidents(undefined), null);
});

test("nêu đúng sự cố đang chặn và thiết bị", () => {
  const message = describeSuppressedIncidents([badStorageOnTempA]);
  assert.match(message ?? "", /Điều kiện bảo quản không đạt/);
  assert.match(message ?? "", /temp_A/);
  assert.match(message ?? "", /Đóng sự cố/);
});

test("cùng một sự cố cũ chặn nhiều thiết bị thì chỉ nêu một lần", () => {
  const message = describeSuppressedIncidents([
    badStorageOnTempA,
    { ...badStorageOnTempA, deviceCode: "humid_A" },
  ]) ?? "";
  assert.equal(message.split("Điều kiện bảo quản không đạt").length - 1, 1);
  assert.match(message, /temp_A, humid_A/);
});
