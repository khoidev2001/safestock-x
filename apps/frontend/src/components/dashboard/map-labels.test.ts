import assert from "node:assert/strict";
import test from "node:test";
import type { AdminWarehouse } from "../../lib/warehouse-api";
import {
  buildLabelCandidates,
  compareCandidates,
  formatPlaceLabel,
  formatWarehouseLabel,
  selectVisibleLabels,
  type LabelCandidate,
  type PlaceFeature,
} from "./map-labels";

const warehouse = (overrides: Partial<AdminWarehouse> = {}): AdminWarehouse => ({
  id: "warehouse-1",
  name: "Phước Lộc",
  location: null,
  kind: "HAMLET",
  communeId: "commune-1",
  lat: 13.3,
  lng: 109.1,
  ...overrides,
});

const place = (overrides: Partial<PlaceFeature["properties"]> = {}): PlaceFeature => ({
  type: "Feature",
  properties: { name: "Phước Lộc", group: "place", kind: "hamlet", ...overrides },
  geometry: { type: "Point", coordinates: [109.1, 13.3] },
});

const project = () => ({ x: 100, y: 100 });

test("warehouse and place labels keep administrative meaning", () => {
  assert.equal(
    formatWarehouseLabel(warehouse({ kind: "CENTRAL", name: "Đồng Xuân" })),
    "Kho tổng xã Đồng Xuân",
  );
  assert.equal(
    formatPlaceLabel(place({ communeName: "Xã Xuân Phước" })),
    "Thôn Phước Lộc · Xã Xuân Phước",
  );
});

test("higher-priority labels win shared screen-space collisions", () => {
  const candidates: LabelCandidate[] = [
    {
      id: "place:poi",
      category: "place",
      lat: 1,
      lng: 1,
      label: "Địa điểm",
      markerKind: "poi",
      priority: 400,
      minZoom: 1,
      estimatedWidth: 100,
      estimatedHeight: 20,
      anchor: "center",
    },
    {
      id: "warehouse:1",
      category: "warehouse",
      lat: 1,
      lng: 1,
      label: "Kho tổng xã Đồng Xuân",
      markerKind: "central-warehouse",
      priority: 1000,
      minZoom: 1,
      estimatedWidth: 100,
      estimatedHeight: 20,
      anchor: "center",
      warehouse: warehouse({ kind: "CENTRAL" }),
    },
  ];
  assert.deepEqual(
    selectVisibleLabels(candidates, project, 14, { width: 300, height: 300 }).map(({ id }) => id),
    ["warehouse:1"],
  );
});

test("candidate construction keeps warehouse, commune and POI categories", () => {
  const candidates = buildLabelCandidates({
    communes: [{ id: "commune-1", name: "Xã Đồng Xuân", lat: 13.3, lng: 109.1 }],
    places: [place({ group: "health", kind: "clinic", name: "Trạm Y tế Đồng Xuân" })],
    warehouses: [warehouse({ kind: "CENTRAL" })],
  });
  assert.deepEqual(
    new Set(candidates.map((candidate) => candidate.category)),
    new Set(["warehouse", "commune", "place"]),
  );
});

test("candidate sorting stays deterministic", () => {
  const a = { id: "place:b", priority: 400 } as LabelCandidate;
  const b = { id: "place:a", priority: 400 } as LabelCandidate;
  assert.equal(compareCandidates(a, b) > 0, true);
});
