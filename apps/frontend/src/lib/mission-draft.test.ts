import assert from "node:assert/strict";
import { test } from "node:test";

import {
  draftKey,
  draftsToEvict,
  isDraftWorthKeeping,
  parseDraft,
  type DraftEntry,
  type MissionDraft,
} from "./mission-draft";

const base: Omit<MissionDraft, "savedAt"> = {
  description: "",
  incidentType: "FLOOD",
  location: "",
  affectedPeople: 0,
  durationHours: 24,
  children: 0,
  elderly: 0,
  medicalSupportCases: 0,
  incidentLat: null,
  incidentLng: null,
  analyzedDescription: null,
};

test("nhiệm vụ chưa có id dùng chung một khoá, không lẫn với nhiệm vụ đã lưu", () => {
  assert.equal(draftKey(null), "safestock.mission-draft.v1.new");
  assert.equal(draftKey("   "), "safestock.mission-draft.v1.new");
  assert.equal(draftKey("m1"), "safestock.mission-draft.v1.m1");
  assert.notEqual(draftKey("m1"), draftKey("m2"));
});

test("JSON hỏng hoặc rỗng thì trả null chứ không ném", () => {
  assert.equal(parseDraft(null), null);
  assert.equal(parseDraft(""), null);
  assert.equal(parseDraft("{khong-phai-json"), null);
  assert.equal(parseDraft("[1,2,3]"), null);
});

test("form còn nguyên mặc định thì coi như không có bản nháp", () => {
  // Ghi lại một form trắng rồi khôi phục nó là đè lên dữ liệu nhiệm vụ thật.
  assert.equal(parseDraft(JSON.stringify({ ...base, savedAt: "2026-09-01" })), null);
  assert.equal(isDraftWorthKeeping(base), false);
});

test("có lời kể hoặc địa điểm hoặc điểm ghim thì đáng giữ", () => {
  assert.equal(isDraftWorthKeeping({ ...base, description: "lũ quét" }), true);
  assert.equal(isDraftWorthKeeping({ ...base, location: "Long Châu" }), true);
  assert.equal(isDraftWorthKeeping({ ...base, incidentLat: 13.3 }), true);
  assert.equal(isDraftWorthKeeping({ ...base, analyzedDescription: "đã phân tích" }), true);
});

test("khôi phục đủ số liệu đã phân tích", () => {
  const draft = parseDraft(
    JSON.stringify({
      ...base,
      description: "lũ quét thôn Long Châu",
      location: "Long Châu",
      affectedPeople: 200,
      durationHours: 48,
      children: 40,
      elderly: 25,
      analyzedDescription: "lũ quét thôn Long Châu",
      savedAt: "2026-09-01T10:00:00.000Z",
    }),
  );
  assert.ok(draft);
  assert.equal(draft.affectedPeople, 200);
  assert.equal(draft.children, 40);
  assert.equal(draft.analyzedDescription, "lũ quét thôn Long Châu");
});

test("toạ độ lẻ một nửa bị bỏ cả cặp", () => {
  // Một nửa toạ độ không ghim được lên bản đồ, mà giữ lại thì lần lưu sau tưởng
  // là đã có điểm và bỏ qua bước bắt người dùng ghim.
  const draft = parseDraft(
    JSON.stringify({ ...base, description: "x", incidentLat: 13.38, savedAt: "" }),
  );
  assert.ok(draft);
  assert.equal(draft.incidentLat, null);
  assert.equal(draft.incidentLng, null);
});

test("kiểu sai trong bộ nhớ không phá form", () => {
  const draft = parseDraft(
    JSON.stringify({
      description: "x",
      affectedPeople: "hai trăm",
      durationHours: null,
      children: {},
      savedAt: 5,
    }),
  );
  assert.ok(draft);
  assert.equal(draft.affectedPeople, 0);
  assert.equal(draft.durationHours, 24);
  assert.equal(draft.children, 0);
  assert.equal(draft.incidentType, "FLOOD");
});

const entry = (key: string, savedAt: string): DraftEntry => ({ key, savedAt });
const NOW = Date.parse("2026-09-05T12:00:00.000Z");
const daysAgo = (n: number) => new Date(NOW - n * 24 * 60 * 60 * 1000).toISOString();

test("bản nháp quá hạn bị dọn, bản còn hạn được giữ", () => {
  const doomed = draftsToEvict(
    [entry("a", daysAgo(8)), entry("b", daysAgo(30)), entry("c", daysAgo(1))],
    NOW,
  );
  assert.deepEqual(doomed.sort(), ["a", "b"]);
});

test("quá hạn mức thì cắt từ bản cũ nhất", () => {
  const entries = [
    entry("m1", daysAgo(6)),
    entry("m2", daysAgo(5)),
    entry("m3", daysAgo(4)),
    entry("m4", daysAgo(3)),
    entry("m5", daysAgo(2)),
    entry("m6", daysAgo(1)),
  ];
  // Sáu bản, hạn mức năm → đúng bản cũ nhất ra đi, năm bản mới ở lại.
  assert.deepEqual(draftsToEvict(entries, NOW), ["m1"]);
});

test("bản của màn hình đang mở không bao giờ bị dọn, kể cả khi cũ nhất", () => {
  const entries = [
    entry("dang-mo", daysAgo(6)),
    entry("m2", daysAgo(5)),
    entry("m3", daysAgo(4)),
    entry("m4", daysAgo(3)),
    entry("m5", daysAgo(2)),
    entry("m6", daysAgo(1)),
  ];
  // Xoá đúng thứ người dùng đang gõ dở là lỗi tệ hơn hẳn việc giữ thừa một bản.
  const doomed = draftsToEvict(entries, NOW, "dang-mo");
  assert.equal(doomed.includes("dang-mo"), false);
  // Nó vẫn tính vào hạn mức, nên bản cũ nhất còn lại phải nhường chỗ.
  assert.deepEqual(doomed, ["m2"]);
});

test("bản đang mở quá hạn cũng được giữ — người dùng vừa mở lại chính nó", () => {
  const doomed = draftsToEvict([entry("dang-mo", daysAgo(90))], NOW, "dang-mo");
  assert.deepEqual(doomed, []);
});

test("mốc thời gian hỏng hoặc thiếu bị xếp vào nhóm cũ nhất", () => {
  // Ghi hỏng thì không biết nó cũ tới đâu; giữ lại là giữ một bản không đọc được.
  assert.deepEqual(draftsToEvict([entry("hong", "khong-phai-ngay")], NOW).sort(), ["hong"]);
  assert.deepEqual(draftsToEvict([entry("thieu", "")], NOW), ["thieu"]);
});

test("dưới hạn mức và còn hạn thì không dọn gì", () => {
  assert.deepEqual(draftsToEvict([entry("a", daysAgo(1)), entry("b", daysAgo(2))], NOW), []);
  assert.deepEqual(draftsToEvict([], NOW, "new"), []);
});
