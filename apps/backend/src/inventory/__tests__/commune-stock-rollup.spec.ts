import {
  communeStockByWarehouse,
  communeStockRollup,
  type BatchForRollup,
} from "../commune-stock-rollup";

const batch = (o: Partial<BatchForRollup> = {}): BatchForRollup => ({
  warehouseId: "kho-tong",
  warehouseName: "Kho xã",
  warehouseKind: "CENTRAL",
  itemSku: "WATER-01",
  itemName: "Nước uống đóng chai",
  unit: "chai",
  quantity: 100,
  onLoan: 0,
  ...o,
});

describe("tồn kho toàn xã gom theo mã vật tư", () => {
  it("cộng hàng ở kho tổng với hàng nằm rải các thôn", () => {
    const result = communeStockRollup([
      batch({ quantity: 100 }),
      batch({
        warehouseId: "thon-a",
        warehouseName: "Kho thôn A",
        warehouseKind: "HAMLET",
        quantity: 40,
      }),
      batch({
        warehouseId: "thon-b",
        warehouseName: "Kho thôn B",
        warehouseKind: "HAMLET",
        quantity: 25,
      }),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].total).toBe(165);
    expect(result[0].atCentral).toBe(100);
    expect(result[0].atHamlets).toBe(65);
    expect(result[0].byWarehouse).toHaveLength(3);
  });

  it("TRỪ phần đang cho mượn — hàng đã rời kho thì không điều được", () => {
    const result = communeStockRollup([batch({ quantity: 100, onLoan: 30 })]);

    expect(result[0].total).toBe(70);
  });

  it("nhiều lô cùng một kho thì gộp thành một dòng kho", () => {
    const result = communeStockRollup([batch({ quantity: 60 }), batch({ quantity: 40 })]);

    expect(result[0].byWarehouse).toHaveLength(1);
    expect(result[0].byWarehouse[0].quantity).toBe(100);
  });

  it("kho giữ nhiều hàng nhất đứng đầu", () => {
    const result = communeStockRollup([
      batch({
        warehouseId: "thon-a",
        warehouseName: "Kho thôn A",
        warehouseKind: "HAMLET",
        quantity: 10,
      }),
      batch({
        warehouseId: "thon-b",
        warehouseName: "Kho thôn B",
        warehouseKind: "HAMLET",
        quantity: 90,
      }),
      batch({ quantity: 50 }),
    ]);

    expect(result[0].byWarehouse.map((k) => k.warehouseName)).toEqual([
      "Kho thôn B",
      "Kho xã",
      "Kho thôn A",
    ]);
  });

  it("tổng luôn bằng tổng các phần", () => {
    const result = communeStockRollup([
      batch({ quantity: 100, onLoan: 10 }),
      batch({ warehouseId: "thon-a", warehouseKind: "HAMLET", quantity: 40, onLoan: 5 }),
    ]);

    const combined = result[0].byWarehouse.reduce((s, k) => s + k.quantity, 0);
    expect(combined).toBe(result[0].total);
    expect(result[0].atCentral + result[0].atHamlets).toBe(result[0].total);
  });

  it("lô đã cho mượn hết thì biến mất, không để lại dòng kho rỗng", () => {
    const result = communeStockRollup([
      batch({ quantity: 50, onLoan: 50 }),
      batch({ warehouseId: "thon-a", warehouseKind: "HAMLET", quantity: 20 }),
    ]);

    expect(result[0].byWarehouse).toHaveLength(1);
    expect(result[0].byWarehouse[0].warehouseId).toBe("thon-a");
  });

  it("trả nhiều hơn mượn (dữ liệu lệch) không cho ra số âm", () => {
    expect(communeStockRollup([batch({ quantity: 10, onLoan: 30 })])).toEqual([]);
  });

  it("nhiều mã vật tư xếp theo tên", () => {
    const result = communeStockRollup([
      batch({ itemSku: "B", itemName: "Nước uống" }),
      batch({ itemSku: "A", itemName: "Áo phao" }),
    ]);

    expect(result.map((d) => d.itemName)).toEqual(["Áo phao", "Nước uống"]);
  });

  it("không có lô nào thì trả mảng rỗng", () => {
    expect(communeStockRollup([])).toEqual([]);
  });
});

describe("tồn kho toàn xã gom theo KHO", () => {
  it("mỗi kho một khối, bên trong là những gì kho đó đang giữ", () => {
    const result = communeStockByWarehouse([
      batch({ quantity: 100 }),
      batch({ itemSku: "LIFE-01", itemName: "Áo phao", quantity: 30 }),
      batch({
        warehouseId: "thon-a",
        warehouseName: "Kho thôn A",
        warehouseKind: "HAMLET",
        quantity: 40,
      }),
    ]);

    expect(result).toHaveLength(2);
    expect(result[0].warehouseName).toBe("Kho xã");
    expect(result[0].items).toHaveLength(2);
    expect(result[0].totalUnits).toBe(130);
    expect(result[0].itemCount).toBe(2);
    expect(result[1].items).toHaveLength(1);
  });

  it("kho tổng luôn đứng đầu, các thôn xếp theo tên", () => {
    const result = communeStockByWarehouse([
      batch({ warehouseId: "thon-z", warehouseName: "Kho thôn Xuân", warehouseKind: "HAMLET" }),
      batch({ warehouseId: "thon-a", warehouseName: "Kho thôn Bình", warehouseKind: "HAMLET" }),
      batch({ quantity: 5 }),
    ]);

    expect(result.map((k) => k.warehouseName)).toEqual([
      "Kho xã",
      "Kho thôn Bình",
      "Kho thôn Xuân",
    ]);
  });

  it("trong một kho, vật tư nhiều nhất lên trước", () => {
    const result = communeStockByWarehouse([
      batch({ itemSku: "A", itemName: "Ít", quantity: 5 }),
      batch({ itemSku: "B", itemName: "Nhiều", quantity: 500 }),
    ]);

    expect(result[0].items.map((m) => m.itemName)).toEqual(["Nhiều", "Ít"]);
  });

  it("TRỪ phần đang cho mượn", () => {
    const result = communeStockByWarehouse([batch({ quantity: 100, onLoan: 40 })]);

    expect(result[0].totalUnits).toBe(60);
    expect(result[0].items[0].quantity).toBe(60);
  });

  it("kho đã cho mượn hết vẫn hiện, nhưng trống — 'thôn này trống' là một thông tin", () => {
    const result = communeStockByWarehouse([batch({ quantity: 50, onLoan: 50 })]);

    expect(result).toHaveLength(1);
    expect(result[0].totalUnits).toBe(0);
    expect(result[0].items).toEqual([]);
    expect(result[0].itemCount).toBe(0);
  });

  it("nhiều lô cùng mã trong một kho thì gộp", () => {
    const result = communeStockByWarehouse([batch({ quantity: 60 }), batch({ quantity: 40 })]);

    expect(result[0].items).toHaveLength(1);
    expect(result[0].items[0].quantity).toBe(100);
  });

  it("không có lô nào thì trả mảng rỗng", () => {
    expect(communeStockByWarehouse([])).toEqual([]);
  });
});
