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

  it("có đủ 17 thôn hiện hành của xã Đồng Xuân và chờ ghim tọa độ", () => {
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
    expect(HAMLET_WAREHOUSES.every(({ lat, lng }) => lat == null && lng == null)).toBe(true);
    expect(HAMLET_WAREHOUSES.every(({ stock }) => stock.length >= 6)).toBe(true);
  });

  it("không tạo kệ bị khóa trong dữ liệu khởi tạo", () => {
    expect(CENTRAL_SHELVES.every((shelf) => !shelf.isLocked)).toBe(true);
  });
});
