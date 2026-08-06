import { communeStockRollup, type BatchForRollup } from "../commune-stock-rollup";

const lo = (o: Partial<BatchForRollup> = {}): BatchForRollup => ({
  warehouseId: "kho-tong",
  warehouseName: "Kho cứu trợ trung tâm",
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
    const ra = communeStockRollup([
      lo({ quantity: 100 }),
      lo({
        warehouseId: "thon-a",
        warehouseName: "Kho thôn A",
        warehouseKind: "HAMLET",
        quantity: 40,
      }),
      lo({
        warehouseId: "thon-b",
        warehouseName: "Kho thôn B",
        warehouseKind: "HAMLET",
        quantity: 25,
      }),
    ]);

    expect(ra).toHaveLength(1);
    expect(ra[0].total).toBe(165);
    expect(ra[0].atCentral).toBe(100);
    expect(ra[0].atHamlets).toBe(65);
    expect(ra[0].byWarehouse).toHaveLength(3);
  });

  it("TRỪ phần đang cho mượn — hàng đã rời kho thì không điều được", () => {
    const ra = communeStockRollup([lo({ quantity: 100, onLoan: 30 })]);

    expect(ra[0].total).toBe(70);
  });

  it("nhiều lô cùng một kho thì gộp thành một dòng kho", () => {
    const ra = communeStockRollup([lo({ quantity: 60 }), lo({ quantity: 40 })]);

    expect(ra[0].byWarehouse).toHaveLength(1);
    expect(ra[0].byWarehouse[0].quantity).toBe(100);
  });

  it("kho giữ nhiều hàng nhất đứng đầu", () => {
    const ra = communeStockRollup([
      lo({
        warehouseId: "thon-a",
        warehouseName: "Kho thôn A",
        warehouseKind: "HAMLET",
        quantity: 10,
      }),
      lo({
        warehouseId: "thon-b",
        warehouseName: "Kho thôn B",
        warehouseKind: "HAMLET",
        quantity: 90,
      }),
      lo({ quantity: 50 }),
    ]);

    expect(ra[0].byWarehouse.map((k) => k.warehouseName)).toEqual([
      "Kho thôn B",
      "Kho cứu trợ trung tâm",
      "Kho thôn A",
    ]);
  });

  it("tổng luôn bằng tổng các phần", () => {
    const ra = communeStockRollup([
      lo({ quantity: 100, onLoan: 10 }),
      lo({ warehouseId: "thon-a", warehouseKind: "HAMLET", quantity: 40, onLoan: 5 }),
    ]);

    const congLai = ra[0].byWarehouse.reduce((s, k) => s + k.quantity, 0);
    expect(congLai).toBe(ra[0].total);
    expect(ra[0].atCentral + ra[0].atHamlets).toBe(ra[0].total);
  });

  it("lô đã cho mượn hết thì biến mất, không để lại dòng kho rỗng", () => {
    const ra = communeStockRollup([
      lo({ quantity: 50, onLoan: 50 }),
      lo({ warehouseId: "thon-a", warehouseKind: "HAMLET", quantity: 20 }),
    ]);

    expect(ra[0].byWarehouse).toHaveLength(1);
    expect(ra[0].byWarehouse[0].warehouseId).toBe("thon-a");
  });

  it("trả nhiều hơn mượn (dữ liệu lệch) không cho ra số âm", () => {
    expect(communeStockRollup([lo({ quantity: 10, onLoan: 30 })])).toEqual([]);
  });

  it("nhiều mã vật tư xếp theo tên", () => {
    const ra = communeStockRollup([
      lo({ itemSku: "B", itemName: "Nước uống" }),
      lo({ itemSku: "A", itemName: "Áo phao" }),
    ]);

    expect(ra.map((d) => d.itemName)).toEqual(["Áo phao", "Nước uống"]);
  });

  it("không có lô nào thì trả mảng rỗng", () => {
    expect(communeStockRollup([])).toEqual([]);
  });
});
