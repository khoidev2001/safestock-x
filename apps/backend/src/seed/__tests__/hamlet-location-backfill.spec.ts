import type { WarehouseLocationMethod, WarehouseKind } from "@prisma/client";
import {
  applyHamletLocationBackfill,
  prepareHamletLocationBackfill,
  type WarehouseLocationRow,
} from "../../../prisma/backfill-hamlet-locations";
import type {
  HamletCulturalHouseLocation,
  HamletCulturalHouseLocationDataset,
} from "../../../prisma/hamlet-location-data";

const location: HamletCulturalHouseLocation = {
  key: "long-chau",
  hamletName: "Long Châu",
  aliases: [],
  lat: 13.37,
  lng: 109.04,
  method: "CULTURAL_HOUSE_OSM",
  sourceName: "OpenStreetMap",
  sourceUrl: "https://www.openstreetmap.org/node/1",
  sourceRef: "n1",
  checkedAt: "2026-07-25",
  methodNote: "Điểm nhà văn hóa thôn đã được xác minh.",
  reviewStatus: "APPROVED",
};

const dataset: HamletCulturalHouseLocationDataset = {
  version: "test",
  boundaryRef: "r19392118",
  locations: [location],
};

describe("hamlet location backfill", () => {
  it("phân loại kho trống, đã ghim và tọa độ dở dang", () => {
    const rows = allHamletRows();
    rows[0] = row({ name: "Kho thôn Long Châu" });
    rows[1] = row({ name: "Kho thôn Long Thăng", lat: 13.4, lng: 109.1 });
    rows[2] = row({ name: "Kho thôn Long Hà", lat: 13.4, lng: null });

    const plan = prepareHamletLocationBackfill(rows, allLocationDataset());

    expect(plan.errors).toEqual([]);
    expect(plan.entries.find((entry) => entry.location.key === "long-chau")?.disposition).toBe(
      "ELIGIBLE",
    );
    expect(plan.entries.find((entry) => entry.location.key === "long-thang")?.disposition).toBe(
      "SKIP_POSITIONED",
    );
    expect(plan.entries.find((entry) => entry.location.key === "long-ha")?.disposition).toBe(
      "SKIP_PARTIAL_COORDINATES",
    );
  });

  it("chặn apply khi thiếu hoặc trùng kho trong tổ chức", () => {
    const missing = allHamletRows().slice(1);
    const duplicate = [...allHamletRows(), row({ id: "duplicate", name: "Kho thôn Long Châu" })];

    expect(prepareHamletLocationBackfill(missing, allLocationDataset()).errors).toEqual(
      expect.arrayContaining([expect.stringContaining("thiếu Kho thôn Long Châu")]),
    );
    expect(prepareHamletLocationBackfill(duplicate, allLocationDataset()).errors).toEqual(
      expect.arrayContaining([expect.stringContaining("kho trùng tên Kho thôn Long Châu")]),
    );
  });

  it("giữ kho trống khi nhà văn hóa chưa xác minh", () => {
    const unresolved = {
      ...location,
      reviewStatus: "UNRESOLVED" as const,
      sourceRef: "candidate-only",
    };
    const completeDataset = allLocationDataset();
    completeDataset.locations[0] = unresolved;
    const plan = prepareHamletLocationBackfill(allHamletRows(), completeDataset);

    expect(plan.errors).toEqual([]);
    expect(plan.entries[0]?.disposition).toBe("SKIP_UNRESOLVED");
  });

  it("apply dùng CAS lat/lng null và ghi provenance nhà văn hóa", async () => {
    const plan = {
      datasetVersion: dataset.version,
      entries: [{ warehouse: row(), location, disposition: "ELIGIBLE" as const }],
      errors: [],
    };
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const client = {
      $transaction: jest.fn(async (callback) => callback({ warehouse: { updateMany } })),
    };
    const appliedAt = new Date("2026-07-25T10:00:00.000Z");

    await expect(applyHamletLocationBackfill(client as never, plan, appliedAt)).resolves.toEqual(
      new Map([["warehouse-1", "APPLIED"]]),
    );
    expect(updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: "warehouse-1",
        lat: null,
        lng: null,
        locationKey: null,
      }),
      data: expect.objectContaining({
        lat: location.lat,
        lng: location.lng,
        locationKey: location.key,
        locationMethod: "CULTURAL_HOUSE_OSM",
        locationSourceRef: "n1",
        locationUpdatedAt: appliedAt,
      }),
    });
  });

  it("báo skip khi admin thắng race và lần chạy sau không còn eligible", async () => {
    const warehouse = row();
    const plan = {
      datasetVersion: dataset.version,
      entries: [{ warehouse, location, disposition: "ELIGIBLE" as const }],
      errors: [],
    };
    const updateMany = jest.fn().mockResolvedValue({ count: 0 });
    const client = {
      $transaction: jest.fn(async (callback) => callback({ warehouse: { updateMany } })),
    };

    await expect(
      applyHamletLocationBackfill(client as never, plan, new Date("2026-07-25T10:00:00Z")),
    ).resolves.toEqual(new Map([["warehouse-1", "CONCURRENTLY_SKIPPED"]]));

    const rerun = prepareHamletLocationBackfill(
      [row({ lat: 13.41, lng: 109.11, locationMethod: "MANUAL_ADMIN" })],
      dataset,
    );
    expect(rerun.entries[0]?.disposition).toBe("SKIP_POSITIONED");
  });
});

function allHamletRows(): WarehouseLocationRow[] {
  return allLocationDataset().locations.map((item, index) =>
    row({ id: `warehouse-${index + 1}`, name: `Kho thôn ${item.hamletName}` }),
  );
}

function allLocationDataset(): HamletCulturalHouseLocationDataset {
  const identities = [
    ["long-chau", "Long Châu"],
    ["long-thang", "Long Thăng"],
    ["long-ha", "Long Hà"],
    ["long-binh", "Long Bình"],
    ["long-my", "Long Mỹ"],
    ["long-thach", "Long Thạch"],
    ["long-hoa", "Long Hòa"],
    ["ky-du", "Kỳ Đu"],
    ["phuoc-hue", "Phước Huệ"],
    ["tan-binh", "Tân Bình"],
    ["tan-an", "Tân An"],
    ["tan-hoa", "Tân Hòa"],
    ["tan-phuoc", "Tân Phước"],
    ["tan-phu", "Tân Phú"],
    ["tan-vinh", "Tân Vinh"],
    ["phu-son", "Phú Sơn"],
    ["triem-duc", "Triêm Đức"],
  ];
  return {
    version: "test",
    boundaryRef: "r19392118",
    locations: identities.map(([key, hamletName], index) => ({
      ...location,
      key,
      hamletName,
      lat: (location.lat ?? 0) + index * 0.001,
      lng: (location.lng ?? 0) + index * 0.001,
      sourceRef: `n${index + 1}`,
    })),
  };
}

function row(overrides: Partial<WarehouseLocationRow> = {}): WarehouseLocationRow {
  return {
    id: "warehouse-1",
    organizationId: "organization-1",
    name: "Kho thôn Long Châu",
    kind: "HAMLET" as WarehouseKind,
    communeId: "dong-xuan",
    lat: null,
    lng: null,
    locationKey: null,
    locationMethod: null as WarehouseLocationMethod | null,
    locationSourceName: null,
    locationSourceUrl: null,
    locationSourceRef: null,
    locationCheckedAt: null,
    locationMethodNote: null,
    locationUpdatedAt: null,
    ...overrides,
  };
}
