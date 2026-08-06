import { parsePendingStockMove } from "../pending-stock-move";

const day = {
  effect: "DEDUCT",
  userId: "u1",
  batchId: "b1",
  quantity: 12,
  scopeWarehouseId: null,
  note: "Mượn liên xã",
  requestId: "loan-1-ACTIVE-0",
};

describe("đọc lời hứa chuyển kho còn dở", () => {
  it("bản ghi đủ hình thì đọc được nguyên vẹn", () => {
    expect(parsePendingStockMove(day)).toEqual(day);
  });

  it("không có lời hứa nào thì trả về rỗng", () => {
    expect(parsePendingStockMove(null)).toBeNull();
    expect(parsePendingStockMove(undefined)).toBeNull();
  });

  it("KHÔNG chấp nhận thứ không phải bản ghi", () => {
    expect(parsePendingStockMove("DEDUCT")).toBeNull();
    expect(parsePendingStockMove(42)).toBeNull();
    // Mảng cũng là object trong JavaScript — bẫy cổ điển, phải chặn riêng.
    expect(parsePendingStockMove([day])).toBeNull();
  });

  it("chiều chuyển lạ thì bỏ qua, không đoán", () => {
    expect(parsePendingStockMove({ ...day, effect: "NONE" })).toBeNull();
    expect(parsePendingStockMove({ ...day, effect: "TRANSFER" })).toBeNull();
  });

  it("số lượng không phải nguyên dương thì bỏ qua", () => {
    // Số âm là đảo chiều lệnh chuyển — nguy hiểm hơn hẳn dữ liệu thiếu.
    expect(parsePendingStockMove({ ...day, quantity: -5 })).toBeNull();
    expect(parsePendingStockMove({ ...day, quantity: 0 })).toBeNull();
    expect(parsePendingStockMove({ ...day, quantity: 1.5 })).toBeNull();
    expect(parsePendingStockMove({ ...day, quantity: "12" })).toBeNull();
  });

  it("thiếu khoá chống trùng thì bỏ qua — chạy lại sẽ chuyển hai lần", () => {
    expect(parsePendingStockMove({ ...day, requestId: "" })).toBeNull();
    expect(parsePendingStockMove({ ...day, requestId: undefined })).toBeNull();
  });

  it("thiếu người thao tác hoặc lô hàng thì bỏ qua", () => {
    expect(parsePendingStockMove({ ...day, userId: "" })).toBeNull();
    expect(parsePendingStockMove({ ...day, batchId: null })).toBeNull();
  });

  it("giữ nguyên phạm vi kho khi có", () => {
    expect(
      parsePendingStockMove({ ...day, scopeWarehouseId: "kho-thon-a" })?.scopeWarehouseId,
    ).toBe("kho-thon-a");
    expect(parsePendingStockMove({ ...day, scopeWarehouseId: 7 })).toBeNull();
  });
});
