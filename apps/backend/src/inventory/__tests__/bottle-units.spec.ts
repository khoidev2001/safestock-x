// Cỡ chai mặc định là 1,5 lít — chai nước cứu trợ phát cho hộ dân (LITERS_PER_WATER_BOTTLE).
import { bottlesNeededFor, BOTTLES_PER_PACK, describeBottleBreakdown, bottleBreakdown } from "../bottle-units";

describe("quy đổi chai — lốc — lít", () => {
  it("mười hai chai là một lốc chẵn", () => {
    const result = bottleBreakdown(12);

    expect(result.packs).toBe(1);
    expect(result.looseBottles).toBe(0);
    expect(result.liters).toBe(18);
  });

  it("chai lẻ ngoài lốc được đếm riêng, không làm tròn mất", () => {
    const result = bottleBreakdown(100);

    expect(result.packs).toBe(8);
    expect(result.looseBottles).toBe(4);
    expect(result.packs * BOTTLES_PER_PACK + result.looseBottles).toBe(100);
  });

  it("số chai gốc không bao giờ bị đổi", () => {
    // Chai là con số kho đếm. Mọi thứ khác suy ra từ nó, không được ngược lại.
    expect(bottleBreakdown(6990).bottles).toBe(6990);
    expect(bottleBreakdown(6990).liters).toBe(10485);
  });

  it("dung tích khác thì lít đổi theo, số chai giữ nguyên", () => {
    expect(bottleBreakdown(10, 0.5).liters).toBe(5);
    expect(bottleBreakdown(10, 0.5).bottles).toBe(10);
  });

  it("số âm hoặc số lẻ không sinh ra chai ma", () => {
    expect(bottleBreakdown(-5).bottles).toBe(0);
    expect(bottleBreakdown(7.9).bottles).toBe(7);
  });

  it("không có chai nào thì mọi con số đều là 0", () => {
    expect(bottleBreakdown(0)).toEqual({ bottles: 0, packs: 0, looseBottles: 0, liters: 0 });
  });
});

describe("câu mô tả cho màn hình", () => {
  it("có lốc lẻ thì nói rõ lẻ mấy chai", () => {
    expect(describeBottleBreakdown(100)).toBe("100 chai (8 lốc lẻ 4) · 150 lít");
  });

  it("chẵn lốc thì không nói phần lẻ", () => {
    expect(describeBottleBreakdown(24)).toBe("24 chai (2 lốc) · 36 lít");
  });

  it("chưa đủ một lốc thì bỏ hẳn phần lốc, không ghi '0 lốc'", () => {
    expect(describeBottleBreakdown(5)).toBe("5 chai · 7,5 lít");
  });
});

describe("tính số chai cần cho một lượng lít", () => {
  it("chia chẵn thì lấy đúng số đó", () => {
    expect(bottlesNeededFor(150)).toBe(100);
  });

  it("chia lẻ thì làm tròn LÊN — thiếu nửa chai là có người không được uống", () => {
    expect(bottlesNeededFor(151)).toBe(101);
    expect(bottlesNeededFor(1)).toBe(1);
  });

  it("không cần lít nào thì không cần chai nào", () => {
    expect(bottlesNeededFor(0)).toBe(0);
    expect(bottlesNeededFor(-10)).toBe(0);
  });

  it("dung tích chai bằng 0 thì CHẶN, không chia cho 0", () => {
    expect(() => bottlesNeededFor(100, 0)).toThrow();
  });
});
