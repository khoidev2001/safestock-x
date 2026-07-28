import assert from "node:assert/strict";
import test from "node:test";
import {
  buildLabelCandidates,
  compareCandidates,
  formatPlaceLabel,
  formatWarehouseLabel,
  selectVisibleLabels,
} from "./map-labels";
import { warehouseLocationLabel } from "../../lib/warehouse-location";
import type { AdminWarehouse } from "../../lib/warehouse-api";
import type { LabelCandidate, PlaceFeature } from "./map-labels";

const warehouse = (overrides: Partial<AdminWarehouse> = {}): AdminWarehouse => ({
  id: "warehouse-1",
  name: "Phước Lộc",
  kind: "HAMLET",
  communeId: "commune-1",
  lat: 13.3,
  lng: 109.1,
  ...overrides,
});

const place = (overrides: Partial<PlaceFeature["properties"]> = {}): PlaceFeature => ({
  type: "Feature",
  properties: {
    name: "Phước Lộc",
    group: "place",
    kind: "hamlet",
    ...overrides,
  },
  geometry: { type: "Point", coordinates: [109.1, 13.3] },
});

const project = (lat: number, lng: number) => ({
  x: lng * 100,
  y: lat * 100,
});

test("commune and warehouse labels keep administrative prefixes", () => {
  assert.equal(
    formatWarehouseLabel(warehouse({ kind: "CENTRAL", name: "Đồng Xuân" })),
    "Kho tổng xã Đồng Xuân",
  );
  assert.equal(
    formatPlaceLabel(place({ communeName: "Xã Xuân Phước" })),
    "Thôn Phước Lộc · Xã Xuân Phước",
  );
});

test("warehouse location labels distinguish cultural houses from unresolved pins", () => {
  assert.equal(
    warehouseLocationLabel(warehouse({ locationMethod: "CULTURAL_HOUSE_GOOGLE_MAPS" })),
    "Nhà văn hóa thôn đã đối chiếu",
  );
  assert.equal(
    warehouseLocationLabel(warehouse({ lat: null, lng: null, locationMethod: null })),
    "Chưa xác minh nhà văn hóa",
  );
});

test("place labels preserve semantic POI names", () => {
  assert.equal(
    formatPlaceLabel(place({ name: "Trạm Y tế Xuân Phước", group: "health", kind: "clinic" })),
    "Trạm Y tế Xuân Phước",
  );
});

test("higher-priority candidates win shared screen-space collisions", () => {
  const candidates: LabelCandidate[] = [
    {
      id: "place:poi",
      category: "place",
      lat: 13.3,
      lng: 109.1,
      label: "Địa điểm",
      markerKind: "poi",
      priority: 400,
      minZoom: 1,
      estimatedWidth: 100,
      estimatedHeight: 20,
      anchor: "center",
    },
    {
      id: "commune:1",
      category: "commune",
      lat: 13.3,
      lng: 109.1,
      label: "Xã Đồng Xuân",
      priority: 800,
      minZoom: 1,
      estimatedWidth: 100,
      estimatedHeight: 20,
      anchor: "center",
    },
    {
      id: "warehouse:1",
      category: "warehouse",
      lat: 13.3,
      lng: 109.1,
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
  const visible = selectVisibleLabels(candidates, project, 14, {
    width: 20000,
    height: 20000,
  });

  assert.deepEqual(
    visible.map((candidate) => candidate.id),
    ["warehouse:1"],
  );
});
test("candidate construction keeps all semantic map categories in one collision set", () => {
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

test("candidate sorting is deterministic for equal priorities", () => {
  const a = { id: "place:b", priority: 400 } as LabelCandidate;
  const b = { id: "place:a", priority: 400 } as LabelCandidate;
  assert.equal(compareCandidates(a, b) > 0, true);

  const first = selectVisibleLabels(
    [a, b].map((candidate) => ({
      ...candidate,
      category: "place" as const,
      lat: 1,
      lng: 1,
      label: candidate.id,
      markerKind: "poi" as const,
      minZoom: 1,
      estimatedWidth: 100,
      estimatedHeight: 20,
      anchor: "center" as const,
    })) as LabelCandidate[],
    () => ({ x: 10, y: 10 }),
    10,
    { width: 100, height: 100 },
  );
  const second = selectVisibleLabels(
    [a, b].reverse().map((candidate) => ({
      ...candidate,
      category: "place" as const,
      lat: 1,
      lng: 1,
      label: candidate.id,
      markerKind: "poi" as const,
      minZoom: 1,
      estimatedWidth: 100,
      estimatedHeight: 20,
      anchor: "center" as const,
    })) as LabelCandidate[],
    () => ({ x: 10, y: 10 }),
    10,
    { width: 100, height: 100 },
  );
  assert.deepEqual(
    first.map(({ id }) => id),
    ["place:a"],
  );
  assert.deepEqual(
    second.map(({ id }) => id),
    ["place:a"],
  );
});
