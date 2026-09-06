import { PickupError, summarizeShortages, validatePickup } from "../mission-pickup";

describe("xác nhận lấy hàng", () => {
  it("lấy đủ thì không cần ghi chú", () => {
    const result = validatePickup({ preparedQuantity: 100, receivedQuantity: 100 });

    expect(result.shortage).toBe(0);
    expect(result.note).toBeNull();
  });

  it("thiếu mà không ghi lý do thì CHẶN", () => {
    expect(() => validatePickup({ preparedQuantity: 100, receivedQuantity: 80 })).toThrow(
      PickupError,
    );
    // Câu báo phải nói rõ thiếu bao nhiêu, không bắt người dùng tự trừ.
    expect(() => validatePickup({ preparedQuantity: 100, receivedQuantity: 80 })).toThrow(/20/);
  });

  it("ghi chú toàn khoảng trắng cũng coi như không ghi", () => {
    expect(() =>
      validatePickup({ preparedQuantity: 100, receivedQuantity: 80, note: "   \n  " }),
    ).toThrow(PickupError);
  });

  it("thiếu có ghi lý do thì nhận, và cắt khoảng trắng thừa", () => {
    const result = validatePickup({
      preparedQuantity: 100,
      receivedQuantity: 80,
      note: "  Xe chỉ chở được 80, chuyến sau lấy nốt  ",
    });

    expect(result.shortage).toBe(20);
    expect(result.note).toBe("Xe chỉ chở được 80, chuyến sau lấy nốt");
  });

  it("lấy nhiều hơn số đã soạn thì CHẶN — hàng không tự sinh ra", () => {
    expect(() => validatePickup({ preparedQuantity: 100, receivedQuantity: 120 })).toThrow(
      /nhiều hơn/,
    );
  });

  it("không lấy được gì cũng phải ghi lý do", () => {
    expect(() => validatePickup({ preparedQuantity: 50, receivedQuantity: 0 })).toThrow(
      PickupError,
    );
    expect(
      validatePickup({
        preparedQuantity: 50,
        receivedQuantity: 0,
        note: "Kho ngập, không vào được",
      }).shortage,
    ).toBe(50);
  });

  it("số lẻ hoặc số âm thì CHẶN", () => {
    expect(() => validatePickup({ preparedQuantity: 100, receivedQuantity: 1.5 })).toThrow(
      PickupError,
    );
    expect(() => validatePickup({ preparedQuantity: 100, receivedQuantity: -1 })).toThrow(
      PickupError,
    );
  });
});

describe("gộp phần thiếu thành một dòng", () => {
  it("không thiếu gì thì không có dòng nào", () => {
    expect(
      summarizeShortages([{ itemName: "Nước", unit: "chai", shortage: 0, note: null }]),
    ).toBeNull();
  });

  it("chỉ kể mã nào thiếu, kèm lý do", () => {
    const result = summarizeShortages([
      { itemName: "Nước uống", unit: "chai", shortage: 20, note: "Hết hàng" },
      { itemName: "Áo phao", unit: "chiếc", shortage: 0, note: null },
      { itemName: "Bạt che", unit: "tấm", shortage: 5, note: null },
    ]);

    expect(result).toBe("Nước uống thiếu 20 chai (Hết hàng); Bạt che thiếu 5 tấm");
  });
});
