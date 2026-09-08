import { MissionWarehouseRequestStatus } from "@prisma/client";
import {
  buildHoldingRows,
  pickedUpQuantityBySku,
  subtractHeldFromRestock,
  type HoldingSourceRequest,
} from "../rescue-holding";

function request(overrides: Partial<HoldingSourceRequest> = {}): HoldingSourceRequest {
  return {
    id: "request-1",
    warehouseId: "warehouse-a",
    sku: "VEST-01",
    itemName: "Áo phao",
    unit: "chiếc",
    status: MissionWarehouseRequestStatus.PICKED_UP,
    preparedAllocations: [
      { batchId: "batch-1", qty: 6, warehouseId: "warehouse-a" },
      { batchId: "batch-2", qty: 4, warehouseId: "warehouse-a" },
    ],
    pickedUpQuantity: 10,
    ...overrides,
  };
}

describe("sổ vật tư đội cứu hộ đang giữ", () => {
  it("lấy đúng những lô đã thật sự rời kho, theo thứ tự đã lưu", () => {
    const rows = buildHoldingRows([request()], [{ sku: "VEST-01", quantity: 8 }]);

    expect(rows).toEqual([
      expect.objectContaining({
        warehouseId: "warehouse-a",
        sku: "VEST-01",
        quantity: 8,
        batches: [
          expect.objectContaining({ batchId: "batch-1", qty: 6 }),
          expect.objectContaining({ batchId: "batch-2", qty: 2 }),
        ],
      }),
    ]);
  });

  it("chỉ đếm phần người đi lấy ĐÃ KÝ NHẬN, không đếm phần kho mới soạn", () => {
    // Kho soạn 10 nhưng xe chỉ chở được 7: ba cái cuối chưa bao giờ ra khỏi kho,
    // nên không ai đang cầm chúng cả.
    const rows = buildHoldingRows(
      [request({ pickedUpQuantity: 7 })],
      [{ sku: "VEST-01", quantity: 7 }],
    );

    expect(rows[0].quantity).toBe(7);
    expect(rows[0].batches).toEqual([
      expect.objectContaining({ batchId: "batch-1", qty: 6 }),
      expect.objectContaining({ batchId: "batch-2", qty: 1 }),
    ]);
  });

  it("phiếu chưa ai ký nhận thì không sinh dòng tạm giữ nào", () => {
    // Rỗng khác hẳn ký nhận 0: hàng vẫn nằm trên sân kho chờ người tới lấy.
    expect(pickedUpQuantityBySku([request({ pickedUpQuantity: null })]).size).toBe(0);
    expect(buildHoldingRows([request({ pickedUpQuantity: null })], [])).toEqual([]);
  });

  it("mỗi kho một dòng riêng vì trả hàng là trả về đúng kho đã xuất", () => {
    const rows = buildHoldingRows(
      [
        request({
          id: "request-a",
          warehouseId: "warehouse-a",
          preparedAllocations: [{ batchId: "batch-a", qty: 5, warehouseId: "warehouse-a" }],
          pickedUpQuantity: 5,
        }),
        request({
          id: "request-b",
          warehouseId: "warehouse-b",
          preparedAllocations: [{ batchId: "batch-b", qty: 5, warehouseId: "warehouse-b" }],
          pickedUpQuantity: 5,
        }),
      ],
      [{ sku: "VEST-01", quantity: 8 }],
    );

    expect(rows).toHaveLength(2);
    expect(rows.map((row) => [row.warehouseId, row.quantity])).toEqual([
      ["warehouse-a", 5],
      ["warehouse-b", 3],
    ]);
  });

  it("chặn khi đội khai giữ nhiều hơn số đã ký nhận", () => {
    // Kẹp âm thầm là biến một con số sai thành một con số trông hợp lệ; người
    // nhập là người duy nhất biết mình vừa gõ nhầm.
    expect(() =>
      buildHoldingRows([request({ pickedUpQuantity: 4 })], [{ sku: "VEST-01", quantity: 9 }]),
    ).toThrow(/đã nhận 4, khai giữ 9/);
  });

  it("khai giữ 0 thì không ghi sổ", () => {
    expect(buildHoldingRows([request()], [{ sku: "VEST-01", quantity: 0 }])).toEqual([]);
  });

  it("hai lượt chạy trên cùng dữ liệu ra cùng một danh sách lô", () => {
    const unsorted = [
      request({ id: "request-z", warehouseId: "warehouse-b" }),
      request({ id: "request-a", warehouseId: "warehouse-a" }),
    ];
    const first = buildHoldingRows(unsorted, [{ sku: "VEST-01", quantity: 12 }]);
    const second = buildHoldingRows([...unsorted].reverse(), [{ sku: "VEST-01", quantity: 12 }]);

    expect(first).toEqual(second);
  });
});

describe("giao thất bại + đội còn giữ hàng", () => {
  it("chỉ hoàn về kho phần đội KHÔNG còn giữ", () => {
    // Không trừ thì cùng một đống hàng vừa được cộng lại vào lô vừa được ghi là
    // đang nằm trên xe — tồn kho tăng khống.
    const held = buildHoldingRows([request()], [{ sku: "VEST-01", quantity: 8 }]);
    const restock = [
      { batchId: "batch-1", quantity: 6 },
      { batchId: "batch-2", quantity: 4 },
    ];

    expect(subtractHeldFromRestock(restock, held)).toEqual([{ batchId: "batch-2", quantity: 2 }]);
  });

  it("đội trả hết thì hoàn nguyên vẹn", () => {
    const restock = [{ batchId: "batch-1", quantity: 6 }];
    expect(subtractHeldFromRestock(restock, [])).toEqual(restock);
  });
});
