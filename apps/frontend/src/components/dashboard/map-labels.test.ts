import assert from "node:assert/strict";
import test from "node:test";
import type { AdminWarehouse } from "../../lib/warehouse-api";
import {
  buildLabelCandidates,
  compareCandidates,
  formatPlaceLabel,
  formatWarehouseLabel,
  isShownPlaceGroup,
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

test("kho thôn rút nhãn về đúng tên thôn, kho trung tâm giữ tên đầy đủ", () => {
  assert.equal(
    formatWarehouseLabel(warehouse({ kind: "HAMLET", name: "Kho thôn Phú Sơn" })),
    "Phú Sơn",
  );
  assert.equal(formatWarehouseLabel(warehouse({ kind: "HAMLET", name: "Kỳ Đu" })), "Kỳ Đu");
  assert.equal(
    formatWarehouseLabel(warehouse({ kind: "CENTRAL", name: "Kho cứu trợ trung tâm Đồng Xuân" })),
    "Kho cứu trợ trung tâm Đồng Xuân",
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

test("candidate construction keeps warehouse and commune categories", () => {
  const candidates = buildLabelCandidates({
    communes: [{ id: "commune-1", name: "Xã Đồng Xuân", lat: 13.3, lng: 109.1 }],
    places: [place({ group: "place", kind: "hamlet", name: "Thôn Phú Sơn" })],
    warehouses: [warehouse({ kind: "CENTRAL" })],
  });
  assert.deepEqual(
    new Set(candidates.map((candidate) => candidate.category)),
    new Set(["warehouse", "commune"]),
    "địa danh không còn được dựng thành nhãn",
  );
});

test("bản đồ điều phối chỉ vẽ kho, bỏ hết nhãn địa danh", () => {
  const hidden = ["place", "health", "school", "civic", "commerce", "worship", "poi"];
  for (const group of hidden) {
    assert.equal(isShownPlaceGroup(group), false, `${group} không được hiện`);
  }

  const candidates = buildLabelCandidates({
    communes: [{ id: "commune-1", name: "Xã Đồng Xuân", lat: 13.3, lng: 109.1 }],
    warehouses: [warehouse({ kind: "HAMLET", name: "Kho thôn Phú Sơn" })],
    places: [
      place({ group: "place", kind: "hamlet", name: "Thôn Phú Sơn" }),
      place({ group: "health", kind: "clinic", name: "Trạm Y tế Đồng Xuân" }),
      place({ group: "school", kind: "school", name: "Trường Tiểu học La Hai" }),
      place({ group: "civic", kind: "office", name: "UBND Xã Đồng Xuân" }),
      place({ group: "commerce", kind: "shop", name: "Chợ La Hai" }),
      place({ group: "worship", kind: "church", name: "Nhà thờ La Hai" }),
    ],
  });
  assert.deepEqual(
    candidates.filter((candidate) => candidate.category === "place"),
    [],
    "không còn nhãn địa danh nào",
  );
  assert.deepEqual(
    candidates.map((candidate) => candidate.label),
    ["Phú Sơn", "Xã Đồng Xuân"],
    "chỉ còn nhãn kho; nhãn xã do map-canvas quyết định có truyền vào hay không",
  );
});

test("candidate sorting stays deterministic", () => {
  const a = { id: "place:b", priority: 400 } as LabelCandidate;
  const b = { id: "place:a", priority: 400 } as LabelCandidate;
  assert.equal(compareCandidates(a, b) > 0, true);
});
