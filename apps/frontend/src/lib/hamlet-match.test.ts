import assert from "node:assert/strict";
import { test } from "node:test";

import {
  findHamlet,
  locationStatus,
  normalizeHamletName,
  selectableHamlets,
  type HamletOption,
} from "./hamlet-match";

const h = (over: Partial<HamletOption> & { name: string }): HamletOption => ({
  id: over.name,
  normalizedName: normalizeHamletName(over.name),
  aliases: [],
  lat: 13.38,
  lng: 109.1,
  verified: true,
  ...over,
});

const DANH_MUC = [
  h({ name: "Long Châu", aliases: ["long chau", "thon long chau", "kho thon long chau"] }),
  h({ name: "Kỳ Đu", aliases: ["ky du", "thon ky du"] }),
  h({ name: "Phú Sơn", aliases: ["phu son"] }),
];

test("bỏ dấu, bỏ hoa thường, gom khoảng trắng — khớp với backend", () => {
  assert.equal(normalizeHamletName("Long Châu"), "long chau");
  assert.equal(normalizeHamletName("  KỲ   ĐU "), "ky du");
  assert.equal(normalizeHamletName("Triêm Đức"), "triem duc");
});

test("khớp cả khi người nói kèm chữ thôn", () => {
  assert.equal(findHamlet(DANH_MUC, "thôn Long Châu")?.name, "Long Châu");
  assert.equal(findHamlet(DANH_MUC, "long chau")?.name, "Long Châu");
  assert.equal(findHamlet(DANH_MUC, "Kỳ Đu")?.name, "Kỳ Đu");
});

test("tên không có trong danh mục thì KHÔNG đoán gần đúng", () => {
  // Đoán gần đúng ở đây là chọn sai thôn rồi điều hàng tới nhầm chỗ.
  assert.equal(findHamlet(DANH_MUC, "Long Châu B"), null);
  assert.equal(findHamlet(DANH_MUC, "Xuân Thọ"), null);
  assert.equal(findHamlet(DANH_MUC, "Phú Sơn xuất"), null);
});

test("ba trạng thái của ô địa điểm", () => {
  assert.equal(locationStatus(DANH_MUC, ""), "EMPTY");
  assert.equal(locationStatus(DANH_MUC, "   "), "EMPTY");
  assert.equal(locationStatus(DANH_MUC, "Long Châu"), "VALID");
  assert.equal(locationStatus(DANH_MUC, "Tân Hòa xa"), "INVALID");
});

test("thôn thiếu toạ độ hoặc chưa xác minh không được đưa vào danh sách chọn", () => {
  const ds = selectableHamlets([
    ...DANH_MUC,
    h({ name: "Chưa ghim", lat: null, lng: null }),
    h({ name: "Chưa duyệt", verified: false }),
  ]);
  assert.deepEqual(
    ds.map((x) => x.name),
    ["Kỳ Đu", "Long Châu", "Phú Sơn"],
  );
});
