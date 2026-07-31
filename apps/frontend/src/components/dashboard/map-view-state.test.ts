import assert from "node:assert/strict";
import test from "node:test";
import type { AdminWarehouse } from "../../lib/warehouse-api";
import {
  beginWarehouseSave,
  clearMatchingSavedDraft,
  finishWarehouseSave,
  mergeWarehouseDraft,
} from "./map-view-state";

const warehouses: AdminWarehouse[] = [
  {
    id: "warehouse-1",
    name: "Kho thôn Phước Lộc",
    location: null,
    kind: "HAMLET",
    communeId: "commune-1",
    lat: null,
    lng: null,
  },
];

test("does not start a second save for the same warehouse", () => {
  const pending = new Set<string>(["warehouse-1"]);
  assert.equal(beginWarehouseSave(pending, "warehouse-1"), null);
});

test("merges draft coordinates without mutating server data", () => {
  const draft = { "warehouse-1": { lat: 13.3, lng: 109.1 } };
  const merged = mergeWarehouseDraft(warehouses, draft);
  assert.deepEqual(merged[0], { ...warehouses[0], ...draft["warehouse-1"] });
  assert.equal(warehouses[0].lat, null);
});

test("only clears a draft that matches the saved coordinate", () => {
  const draft = { "warehouse-1": { lat: 13.3, lng: 109.1 } };
  assert.deepEqual(clearMatchingSavedDraft(draft, "warehouse-1", { lat: 13.3, lng: 109.1 }), {});
  assert.deepEqual(
    clearMatchingSavedDraft(draft, "warehouse-1", { lat: 13.31, lng: 109.1 }),
    draft,
  );
  assert.deepEqual(finishWarehouseSave(new Set(["warehouse-1"]), "warehouse-1"), new Set());
});
