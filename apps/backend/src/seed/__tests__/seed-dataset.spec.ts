import { IncidentType } from "@safestock/shared-types";
import {
  CENTRAL_BATCHES,
  CENTRAL_SHELVES,
  HAMLET_WAREHOUSES,
  STANDARD_ITEMS,
  validateSeedDataset,
} from "../../../prisma/seed-data";
import { MISSION_NORMS } from "../../mission/mission.config";

describe("standard seed dataset", () => {
  it("có đầy đủ SKU cho mọi định mức Mission", () => {
    const catalogSkus = new Set(STANDARD_ITEMS.map((item) => item.sku));
    const requiredSkus = new Set(
      Object.values(IncidentType).flatMap((type) => MISSION_NORMS[type].map((rule) => rule.sku)),
    );

    expect([...requiredSkus].filter((sku) => !catalogSkus.has(sku))).toEqual([]);
  });

  it("mỗi SKU Mission có ít nhất một lô trung tâm cấp phát được", () => {
    const requiredSkus = new Set(
      Object.values(MISSION_NORMS).flatMap((rules) => rules.map((rule) => rule.sku)),
    );

    for (const sku of requiredSkus) {
      expect(
        CENTRAL_BATCHES.some(
          (batch) =>
            batch.sku === sku &&
            batch.quantity > 0 &&
            batch.condition !== "DAMAGED" &&
            batch.condition !== "NEEDS_CHECK" &&
            !batch.shelfLocked &&
            (batch.expiryOffsetDays == null || batch.expiryOffsetDays > 0),
        ),
      ).toBe(true);
    }
  });

  it("không có SKU, batch code trùng hoặc số lượng âm", () => {
    expect(validateSeedDataset()).toEqual([]);
  });

  it("có đủ nhóm cứu trợ cơ bản, WASH, y tế, che chắn và liên lạc", () => {
    const groups = new Set(STANDARD_ITEMS.map((item) => item.group));
    expect([...groups]).toEqual(
      expect.arrayContaining(["WASH", "FOOD", "RESCUE", "SHELTER", "HEALTH", "COMMUNICATION"]),
    );
  });

  it("có đủ 17 thôn, chỉ seed 5 Nhà văn hóa đã xác minh và giữ 12 điểm chờ ghim", () => {
    expect(HAMLET_WAREHOUSES.map((warehouse) => warehouse.name)).toEqual([
      "Kho thôn Long Châu",
      "Kho thôn Long Thăng",
      "Kho thôn Long Hà",
      "Kho thôn Long Bình",
      "Kho thôn Long Mỹ",
      "Kho thôn Long Thạch",
      "Kho thôn Long Hòa",
      "Kho thôn Kỳ Đu",
      "Kho thôn Phước Huệ",
      "Kho thôn Tân Bình",
      "Kho thôn Tân An",
      "Kho thôn Tân Hòa",
      "Kho thôn Tân Phước",
      "Kho thôn Tân Phú",
      "Kho thôn Tân Vinh",
      "Kho thôn Phú Sơn",
      "Kho thôn Triêm Đức",
    ]);
    expect(new Set(HAMLET_WAREHOUSES.map((warehouse) => warehouse.key)).size).toBe(17);
    expect(
      HAMLET_WAREHOUSES.filter((warehouse) => warehouse.locationVerified).map(
        ({ key, location, lat, lng }) => ({ key, location, lat, lng }),
      ),
    ).toEqual([
      {
        key: "ky-du",
        location: "Nhà Văn hóa thôn Kỳ Đu",
        lat: 13.3636977,
        lng: 109.062318,
      },
      {
        key: "phuoc-hue",
        location: "Nhà Văn hoá thôn Phước Huệ",
        lat: 13.3698758,
        lng: 109.0787774,
      },
      {
        key: "tan-binh",
        location: "Nhà sinh hoạt cộng đồng thôn Tân Bình",
        lat: 13.365686,
        lng: 109.144698,
      },
      {
        key: "phu-son",
        location: "Nhà Văn hóa thôn Phú Sơn",
        lat: 13.3504381,
        lng: 109.0451656,
      },
      {
        key: "triem-duc",
        location: "Nhà Văn hóa thôn Triêm Đức",
        lat: 13.3615575,
        lng: 109.0703455,
      },
    ]);
    const pendingLocations = HAMLET_WAREHOUSES.filter((warehouse) => !warehouse.locationVerified);
    expect(pendingLocations).toHaveLength(12);
    expect(
      pendingLocations.every(
        ({ location, lat, lng }) =>
          location.startsWith("Nhà văn hóa thôn ") && lat == null && lng == null,
      ),
    ).toBe(true);
    expect(HAMLET_WAREHOUSES.every(({ stock }) => stock.length >= 6)).toBe(true);
  });

  it("không tạo kệ bị khóa trong dữ liệu khởi tạo", () => {
    expect(CENTRAL_SHELVES.every((shelf) => !shelf.isLocked)).toBe(true);
  });
});
