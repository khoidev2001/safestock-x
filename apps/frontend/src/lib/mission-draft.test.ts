import assert from "node:assert/strict";
import { test } from "node:test";

import { draftKey, isDraftWorthKeeping, parseDraft, type MissionDraft } from "./mission-draft";

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
