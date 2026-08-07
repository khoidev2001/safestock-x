import { chaiCanCho, CHAI_MOI_LOC, moTaQuyDoi, quyDoiChai } from "../bottle-units";

describe("quy đổi chai — lốc — lít", () => {
  it("mười hai chai là một lốc chẵn", () => {
    const ra = quyDoiChai(12);

    expect(ra.packs).toBe(1);
    expect(ra.looseBottles).toBe(0);
    expect(ra.liters).toBe(60);
  });

  it("chai lẻ ngoài lốc được đếm riêng, không làm tròn mất", () => {
    const ra = quyDoiChai(100);

    expect(ra.packs).toBe(8);
    expect(ra.looseBottles).toBe(4);
    expect(ra.packs * CHAI_MOI_LOC + ra.looseBottles).toBe(100);
  });

  it("số chai gốc không bao giờ bị đổi", () => {
    // Chai là con số kho đếm. Mọi thứ khác suy ra từ nó, không được ngược lại.
    expect(quyDoiChai(6990).bottles).toBe(6990);
    expect(quyDoiChai(6990).liters).toBe(34_950);
  });

  it("dung tích khác thì lít đổi theo, số chai giữ nguyên", () => {
    expect(quyDoiChai(10, 1.5).liters).toBe(15);
    expect(quyDoiChai(10, 1.5).bottles).toBe(10);
  });

  it("số âm hoặc số lẻ không sinh ra chai ma", () => {
    expect(quyDoiChai(-5).bottles).toBe(0);
    expect(quyDoiChai(7.9).bottles).toBe(7);
  });

  it("không có chai nào thì mọi con số đều là 0", () => {
    expect(quyDoiChai(0)).toEqual({ bottles: 0, packs: 0, looseBottles: 0, liters: 0 });
  });
});

describe("câu mô tả cho màn hình", () => {
  it("có lốc lẻ thì nói rõ lẻ mấy chai", () => {
    expect(moTaQuyDoi(100)).toBe("100 chai (8 lốc lẻ 4) · 500 lít");
  });

  it("chẵn lốc thì không nói phần lẻ", () => {
    expect(moTaQuyDoi(24)).toBe("24 chai (2 lốc) · 120 lít");
  });

  it("chưa đủ một lốc thì bỏ hẳn phần lốc, không ghi '0 lốc'", () => {
    expect(moTaQuyDoi(5)).toBe("5 chai · 25 lít");
  });
});

describe("tính số chai cần cho một lượng lít", () => {
  it("chia chẵn thì lấy đúng số đó", () => {
    expect(chaiCanCho(100)).toBe(20);
  });

  it("chia lẻ thì làm tròn LÊN — thiếu nửa chai là có người không được uống", () => {
    expect(chaiCanCho(101)).toBe(21);
    expect(chaiCanCho(1)).toBe(1);
  });

  it("không cần lít nào thì không cần chai nào", () => {
    expect(chaiCanCho(0)).toBe(0);
    expect(chaiCanCho(-10)).toBe(0);
  });

  it("dung tích chai bằng 0 thì CHẶN, không chia cho 0", () => {
    expect(() => chaiCanCho(100, 0)).toThrow();
  });
});
