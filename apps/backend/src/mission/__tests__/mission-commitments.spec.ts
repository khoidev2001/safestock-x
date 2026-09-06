import {
  commitmentKey,
  commitmentMap,
  shortfallMessage,
  subtractCommitments,
  type Shortfall,
} from "../mission-commitments";
import type { AvailableBatch } from "../mission.compute";

const batch = (
  batchId: string,
  warehouseId: string,
  quantity: number,
  expiry?: string,
): AvailableBatch => ({
  batchId,
  sku: "LIFE-ADULT",
  quantity,
  expiryDate: expiry ? new Date(expiry) : null,
  warehouseId,
  warehouseName: warehouseId === "long-chau" ? "Kho thôn Long Châu" : "Kho khác",
  distanceKm: 1,
});

describe("commitmentMap", () => {
  it("cộng dồn nhiều nhiệm vụ cùng đặt gạch một kho", () => {
    const map = commitmentMap([
      { warehouseId: "long-chau", sku: "LIFE-ADULT", quantity: 10 },
      { warehouseId: "long-chau", sku: "LIFE-ADULT", quantity: 5 },
      { warehouseId: "long-ha", sku: "LIFE-ADULT", quantity: 3 },
    ]);
    expect(map.get(commitmentKey("long-chau", "LIFE-ADULT"))).toBe(15);
    expect(map.get(commitmentKey("long-ha", "LIFE-ADULT"))).toBe(3);
  });
});

describe("subtractCommitments", () => {
  it("kho đã hứa hết thì biến mất khỏi danh sách khả dụng", () => {
    // Đúng tình huống người dùng nêu: Long Châu có 10, admin1 nhận trọn 10, nên
    // lượt lập phương án kế tiếp KHÔNG được thấy cái nào ở kho đó nữa.
    const { available, consumedReasons } = subtractCommitments(
      [batch("b1", "long-chau", 10)],
      commitmentMap([{ warehouseId: "long-chau", sku: "LIFE-ADULT", quantity: 10 }]),
    );
    expect(available).toEqual([]);
    expect(consumedReasons[0].reason).toContain("Kho thôn Long Châu");
  });

  it("hứa một phần thì chỉ trừ đúng phần đó", () => {
    const { available } = subtractCommitments(
      [batch("b1", "long-chau", 10)],
      commitmentMap([{ warehouseId: "long-chau", sku: "LIFE-ADULT", quantity: 4 }]),
    );
    expect(available).toEqual([expect.objectContaining({ batchId: "b1", quantity: 6 })]);
  });

  it("không đụng tới kho khác", () => {
    const { available } = subtractCommitments(
      [batch("b1", "long-chau", 10), batch("b2", "long-ha", 8)],
      commitmentMap([{ warehouseId: "long-chau", sku: "LIFE-ADULT", quantity: 10 }]),
    );
    expect(available).toEqual([expect.objectContaining({ batchId: "b2", quantity: 8 })]);
  });

  it("trừ vào lô hết hạn sớm trước, cùng thứ tự bộ phân bổ tiêu thụ", () => {
    // Trừ ngược thứ tự thì tổng vẫn đúng nhưng phần dư nằm ở lô bộ phân bổ không
    // đụng tới, và phương án lại hứa một lô thực chất đã có người đặt.
    const { available } = subtractCommitments(
      [batch("het-som", "long-chau", 6, "2026-01-01"), batch("het-muon", "long-chau", 6, "2027-01-01")],
      commitmentMap([{ warehouseId: "long-chau", sku: "LIFE-ADULT", quantity: 6 }]),
    );
    expect(available).toEqual([expect.objectContaining({ batchId: "het-muon", quantity: 6 })]);
  });

  it("không có cam kết nào thì trả nguyên danh sách", () => {
    const original = [batch("b1", "long-chau", 10)];
    expect(subtractCommitments(original, new Map()).available).toBe(original);
  });
});

describe("shortfallMessage", () => {
  it("nói rõ kho nào, thiếu bao nhiêu, và hệ thống đã làm gì tiếp", () => {
    const shortfall: Shortfall = {
      warehouseId: "long-chau",
      warehouseName: "Kho thôn Long Châu",
      sku: "LIFE-ADULT",
      itemName: "Áo phao người lớn",
      unit: "chiếc",
      requested: 5,
      stillAvailable: 0,
      physicalStock: 240,
      promisedToOthers: 1030,
    };
    const message = shortfallMessage([shortfall]);
    expect(message).toContain("cần 5 chiếc");
    expect(message).toContain("tính lại");
  });

  it("nói CẢ tồn thật lẫn phần đã hứa, không chỉ nói phần còn dùng được", () => {
    // Bản đầu chỉ ghi "chỉ còn 0/5" — người dùng ra kho thấy hàng chất đầy rồi
    // kết luận hệ thống tính sai. Hàng có thật, nhưng đã có chủ.
    const message = shortfallMessage([
      {
        warehouseId: "long-ha",
        warehouseName: "Kho thôn Long Hà",
        sku: "WATER-01",
        itemName: "Nước uống đóng chai",
        unit: "chai",
        requested: 100,
        stillAvailable: 0,
        physicalStock: 240,
        promisedToOthers: 1030,
      },
    ]);
    expect(message).toContain("kho còn 240");
    expect(message).toContain("đã hứa 1030");
    expect(message).toContain("chỉ dùng được 0");
  });
});

describe("lý do lô bị ăn hết", () => {
  it("kèm con số tồn thật và phần đã hứa", () => {
    // "Đã hứa cho nhiệm vụ khác" không nói được là hết sạch hay chỉ vơi đi.
    const { consumedReasons } = subtractCommitments(
      [batch("b1", "long-chau", 240)],
      commitmentMap([{ warehouseId: "long-chau", sku: "LIFE-ADULT", quantity: 1030 }]),
    );
    expect(consumedReasons[0].reason).toContain("còn 240");
    expect(consumedReasons[0].reason).toContain("đã hứa 1030");
  });
});
