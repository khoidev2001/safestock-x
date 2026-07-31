import assert from "node:assert/strict";
import test from "node:test";
import { alarmTitleFor, selectAlarmingIncidents } from "../src/renderer/lib/incident-alarm";
import type { Incident } from "../src/renderer/lib/backend";

const incident = (overrides: Partial<Incident> = {}): Incident => ({
  id: "incident-1",
  kind: "BAD_STORAGE",
  severity: "MEDIUM",
  confidence: 0.8,
  title: "Nhiệt độ kho vượt ngưỡng bảo quản",
  state: "OPEN",
  detectedAt: "2026-07-31T08:00:00.000Z",
  ...overrides,
});

test("lượt tải đầu chỉ ghi nhận hiện trạng, không kéo chuông vì sự cố cũ", () => {
  // Người vừa mở máy không nên bị dội chuông cho chuyện của hôm qua.
  const result = selectAlarmingIncidents([incident()], new Set(), false);

  assert.deepEqual(result.ringing, []);
  assert.ok(result.knownIds.has("incident-1"));
});

test("sự cố mới xuất hiện sau khi đã mồi thì kéo chuông", () => {
  const seeded = selectAlarmingIncidents([incident()], new Set(), false);
  const next = selectAlarmingIncidents(
    [incident(), incident({ id: "incident-2", title: "Nguy cơ cháy" })],
    seeded.knownIds,
    true,
  );

  assert.equal(next.ringing.length, 1);
  assert.equal(next.ringing[0]?.id, "incident-2");
});

test("sự cố nguồn phần cứng kéo chuông giống hệt sự cố do người vận hành gây ra", () => {
  // Không có nhánh nào phân biệt nguồn: chuông kêu vì CÓ SỰ CỐ.
  const seeded = selectAlarmingIncidents([], new Set(), false);
  const fromHardware = selectAlarmingIncidents(
    [incident({ id: "incident-hw", kind: "DEVICE_SILENT", title: "Mất tín hiệu thiết bị temp_A" })],
    seeded.knownIds,
    true,
  );

  assert.equal(fromHardware.ringing.length, 1);
  assert.equal(fromHardware.ringing[0]?.id, "incident-hw");
});

test("sự cố đã tiếp nhận hoặc đã xử lý không kéo chuông nữa", () => {
  const acknowledged = selectAlarmingIncidents(
    [incident({ id: "a", state: "ACKNOWLEDGED" }), incident({ id: "b", state: "RESOLVED" })],
    new Set(),
    true,
  );

  assert.deepEqual(acknowledged.ringing, []);
  assert.equal(acknowledged.knownIds.size, 0);
});

test("sự cố đóng rồi mở lại được coi là mới và kéo chuông lần nữa", () => {
  const opened = selectAlarmingIncidents([incident()], new Set(), false);
  const resolved = selectAlarmingIncidents(
    [incident({ state: "RESOLVED" })],
    opened.knownIds,
    true,
  );
  const reopened = selectAlarmingIncidents([incident()], resolved.knownIds, true);

  assert.deepEqual(resolved.ringing, []);
  assert.equal(reopened.ringing.length, 1);
});

test("cùng một sự cố không kéo chuông lặp lại ở mỗi lượt làm mới", () => {
  const seeded = selectAlarmingIncidents([], new Set(), false);
  const first = selectAlarmingIncidents([incident()], seeded.knownIds, true);
  const second = selectAlarmingIncidents([incident()], first.knownIds, true);

  assert.equal(first.ringing.length, 1);
  assert.deepEqual(second.ringing, []);
});

test("nhiều sự cố cùng lúc được gộp thành một tiêu đề chuông", () => {
  assert.equal(
    alarmTitleFor([incident({ title: "Nguy cơ cháy" }), incident({ title: "Mất tín hiệu" })]),
    "Nguy cơ cháy · Mất tín hiệu",
  );
});
