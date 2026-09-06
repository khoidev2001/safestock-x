import { stockMarksFromLoans, type LoanLike } from "../loan-stock-marks";

const loan = (o: Partial<LoanLike> = {}): LoanLike => ({
  direction: "OUTGOING",
  status: "ACTIVE",
  itemSku: "WATER-01",
  itemName: "Nước uống đóng chai",
  unit: "chai",
  quantity: 200,
  returnedQuantity: 0,
  peerCommuneName: "Xuân Thọ",
  ...o,
});

describe("nhãn hàng đang mắc nợ với xã khác", () => {
  it("tách rõ hàng CHO MƯỢN với hàng ĐANG MƯỢN", () => {
    const result = stockMarksFromLoans([
      loan({ direction: "OUTGOING", quantity: 200 }),
      loan({ direction: "INCOMING", quantity: 50, peerCommuneName: "Tuy An Bắc" }),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].lentOut).toBe(200);
    expect(result[0].borrowedIn).toBe(50);
    expect(result[0].peers).toEqual(["Xuân Thọ", "Tuy An Bắc"]);
  });

  it("chỉ tính phần CÒN NỢ, không tính phần đã trả", () => {
    const result = stockMarksFromLoans([loan({ quantity: 200, returnedQuantity: 120 })]);

    expect(result[0].lentOut).toBe(80);
  });

  it("BỎ QUA yêu cầu chưa duyệt — chưa có hàng nào rời chỗ", () => {
    // Đưa vào là bịa ra một khoản nợ chưa tồn tại, và kho hiện thiếu hàng mà nó
    // vẫn đang giữ đủ.
    const result = stockMarksFromLoans([
      loan({ status: "REQUESTED" }),
      loan({ status: "APPROVED" }),
      loan({ status: "REJECTED" }),
      loan({ status: "CANCELLED" }),
    ]);

    expect(result).toEqual([]);
  });

  it("khoản đã trả xong biến mất khỏi nhãn", () => {
    expect(stockMarksFromLoans([loan({ status: "RETURNED", returnedQuantity: 200 })])).toEqual([]);
    // Trả hết nhưng trạng thái chưa kịp đóng thì cũng không còn nợ gì.
    expect(
      stockMarksFromLoans([loan({ status: "ACTIVE", quantity: 200, returnedQuantity: 200 })]),
    ).toEqual([]);
  });

  it("nhiều khoản cùng mã vật tư thì cộng dồn", () => {
    const result = stockMarksFromLoans([
      loan({ quantity: 100 }),
      loan({ quantity: 50, peerCommuneName: "Tuy An Bắc" }),
    ]);

    expect(result[0].lentOut).toBe(150);
    expect(result[0].peers).toHaveLength(2);
  });

  it("nhiều mã vật tư xếp theo tên", () => {
    const result = stockMarksFromLoans([
      loan({ itemSku: "B", itemName: "Áo phao" }),
      loan({ itemSku: "A", itemName: "Nước uống" }),
    ]);

    expect(result.map((x) => x.itemName)).toEqual(["Áo phao", "Nước uống"]);
  });

  it("không có khoản nào thì trả mảng rỗng", () => {
    expect(stockMarksFromLoans([])).toEqual([]);
  });

  it("dữ liệu lệch (trả nhiều hơn mượn) không cho ra số âm", () => {
    expect(stockMarksFromLoans([loan({ quantity: 100, returnedQuantity: 150 })])).toEqual([]);
  });
});
