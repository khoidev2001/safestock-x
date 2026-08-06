const assert = require("node:assert/strict");
const { test } = require("node:test");

const { inventoryQrPayload } = require("../dist/index.js");

test("dạng URL mà máy quét trong app đọc được", () => {
  assert.equal(
    inventoryQrPayload("WATER-01", "WATER-2026-01"),
    "safestock://inventory?sku=WATER-01&batch=WATER-2026-01",
  );
});

test("không có mã lô thì chỉ mang SKU, không kèm khoá rỗng", () => {
  // "batch=" rỗng làm máy quét hiểu là có mã lô nhưng rỗng, khác hẳn với không có.
  assert.equal(inventoryQrPayload("WATER-01"), "safestock://inventory?sku=WATER-01");
  assert.equal(inventoryQrPayload("WATER-01", "   "), "safestock://inventory?sku=WATER-01");
  assert.equal(inventoryQrPayload("WATER-01", null), "safestock://inventory?sku=WATER-01");
});

test("cắt khoảng trắng thừa hai đầu", () => {
  assert.equal(
    inventoryQrPayload("  WATER-01  ", "  L1  "),
    "safestock://inventory?sku=WATER-01&batch=L1",
  );
});

test("ký tự đặc biệt được mã hoá, không làm vỡ URL", () => {
  assert.match(inventoryQrPayload("SKU A&B", "lô#1"), /^safestock:\/\/inventory\?sku=SKU\+A%26B/);
});
