import assert from "node:assert/strict";
import test from "node:test";
import type { AdminWarehouse } from "../../lib/warehouse-api";
import {
  beginWarehouseSave,
  clearMatchingSavedDraft,
  finishWarehouseSave,
  mergeWarehouseDraft,
  type WarehouseDraft,
} from "./map-view-state";

const warehouses: AdminWarehouse[] = [
  {
    id: "warehouse-1",
    name: "Kho thôn Phước Lộc",
    kind: "HAMLET",
    communeId: "commune-1",
    lat: null,
    lng: null,
  },
];

test("draft coordinates are rendered without mutating persisted warehouse data", () => {
  const draft: WarehouseDraft = {
    "warehouse-1": { lat: 13.34733, lng: 109.09281 },
  };

  const merged = mergeWarehouseDraft(warehouses, draft);
  assert.equal(merged[0].lat, 13.34733);
  assert.equal(merged[0].lng, 109.09281);
  assert.equal(warehouses[0].lat, null);
  assert.equal(warehouses[0].lng, null);
});

test("matching save success clears only the submitted warehouse draft", () => {
  const draft: WarehouseDraft = {
    "warehouse-1": { lat: 13.34733, lng: 109.09281 },
    "warehouse-2": { lat: 13.3, lng: 109 },
  };

  const next = clearMatchingSavedDraft(draft, "warehouse-1", {
    lat: 13.34733,
    lng: 109.09281,
  });
  assert.deepEqual(next, {
    "warehouse-2": { lat: 13.3, lng: 109 },
  });
  assert.notEqual(next, draft);
});

test("stale save success preserves a newer draft for retry", () => {
  const draft: WarehouseDraft = {
    "warehouse-1": { lat: 13.4, lng: 109.2 },
  };

  const next = clearMatchingSavedDraft(draft, "warehouse-1", {
    lat: 13.34733,
    lng: 109.09281,
  });
  assert.equal(next, draft);
  assert.deepEqual(next["warehouse-1"], { lat: 13.4, lng: 109.2 });
});

test("warehouse save state allows different warehouses but blocks duplicates", () => {
  const first = beginWarehouseSave(new Set(), "warehouse-1");
  assert.deepEqual([...first!], ["warehouse-1"]);
  assert.equal(beginWarehouseSave(first!, "warehouse-1"), null);

  const second = beginWarehouseSave(first!, "warehouse-2");
  assert.deepEqual([...second!], ["warehouse-1", "warehouse-2"]);
  assert.deepEqual(
    [...finishWarehouseSave(second!, "warehouse-1")],
    ["warehouse-2"],
  );
});

test("finishing an unknown warehouse does not mutate pending state", () => {
  const pending = new Set(["warehouse-1"]);
  const next = finishWarehouseSave(pending, "warehouse-2");
  assert.deepEqual([...next], ["warehouse-1"]);
  assert.notEqual(next, pending);
});
