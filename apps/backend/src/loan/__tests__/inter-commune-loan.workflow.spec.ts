import {
  actorOf,
  allowedTransitions,
  findTransition,
  isTerminal,
  MANUAL_INITIAL_STATUS,
  stockEffect,
  manualEntryStockEffect,
  manualStockEffect,
  statusAfterReturn,
  type InterCommuneStatus,
} from "../inter-commune-loan.workflow";

describe("máy trạng thái mượn liên xã", () => {
  it("chỉ bên CHO MƯỢN mới quyết được yêu cầu", () => {
    const tu = allowedTransitions("REQUESTED");

    expect(tu.find((t) => t.to === "APPROVED")?.by).toBe("LENDER");
    expect(tu.find((t) => t.to === "REJECTED")?.by).toBe("LENDER");
    // Bên đi mượn chỉ rút lại yêu cầu của chính mình.
    expect(tu.find((t) => t.to === "CANCELLED")?.by).toBe("BORROWER");
  });

  it("chỉ bên ĐI MƯỢN mới xác nhận đã nhận và mới ghi trả", () => {
    expect(findTransition("APPROVED", "ACTIVE")?.by).toBe("BORROWER");
    expect(findTransition("ACTIVE", "RETURNED")?.by).toBe("BORROWER");
  });

  it("đã đồng ý mà bên kia không tới lấy thì thu hồi được", () => {
    // Không có đường này thì hàng nằm treo vĩnh viễn ngoài sổ: kho đã trừ mà
    // chẳng ai đang giữ.
    const thuHoi = findTransition("APPROVED", "CANCELLED");

    expect(thuHoi?.by).toBe("LENDER");
    expect(thuHoi?.stock).toBe("ADD");
  });

  it("ba trạng thái kết thúc không đi tiếp được nữa", () => {
    for (const status of ["REJECTED", "CANCELLED", "RETURNED"] as InterCommuneStatus[]) {
      expect(isTerminal(status)).toBe(true);
      expect(allowedTransitions(status)).toEqual([]);
    }
  });

  it("không nhảy cóc: yêu cầu chưa duyệt thì không thể thành đang nợ", () => {
    expect(findTransition("REQUESTED", "ACTIVE")).toBeNull();
    expect(findTransition("REQUESTED", "RETURNED")).toBeNull();
    expect(findTransition("APPROVED", "RETURNED")).toBeNull();
  });

  it("không quay ngược: đã trả rồi thì không trở lại đang nợ", () => {
    expect(findTransition("RETURNED", "ACTIVE")).toBeNull();
    expect(findTransition("REJECTED", "APPROVED")).toBeNull();
    expect(findTransition("CANCELLED", "APPROVED")).toBeNull();
  });

  describe("kho bên nào đổi — chỗ dễ sai nhất", () => {
    it("đồng ý cho mượn: TRỪ kho bên cho mượn, KHÔNG đụng kho bên mượn", () => {
      const buoc = findTransition("REQUESTED", "APPROVED")!;

      expect(stockEffect("OUTGOING", buoc)).toBe("DEDUCT");
      // Hàng chưa tới tay bên mượn. Cộng lúc này là kho hiện số mình chưa cầm.
      expect(stockEffect("INCOMING", buoc)).toBe("NONE");
    });

    it("xác nhận đã nhận: CỘNG kho bên mượn, kho bên cho mượn không đổi nữa", () => {
      const buoc = findTransition("APPROVED", "ACTIVE")!;

      expect(stockEffect("INCOMING", buoc)).toBe("ADD");
      // Bên cho mượn đã trừ từ bước trước; trừ tiếp là trừ hai lần.
      expect(stockEffect("OUTGOING", buoc)).toBe("NONE");
    });

    it("ghi nhận đã trả: TRỪ kho bên mượn", () => {
      const buoc = findTransition("ACTIVE", "RETURNED")!;

      expect(stockEffect("INCOMING", buoc)).toBe("DEDUCT");
      expect(stockEffect("OUTGOING", buoc)).toBe("NONE");
    });

    it("thu hồi khi bên kia không nhận: hoàn lại kho bên cho mượn", () => {
      const buoc = findTransition("APPROVED", "CANCELLED")!;

      expect(stockEffect("OUTGOING", buoc)).toBe("ADD");
      expect(stockEffect("INCOMING", buoc)).toBe("NONE");
    });

    it("từ chối và huỷ yêu cầu KHÔNG đụng kho bên nào", () => {
      for (const buoc of [
        findTransition("REQUESTED", "REJECTED")!,
        findTransition("REQUESTED", "CANCELLED")!,
      ]) {
        expect(stockEffect("OUTGOING", buoc)).toBe("NONE");
        expect(stockEffect("INCOMING", buoc)).toBe("NONE");
      }
    });

    it("mỗi bước khai đúng MỘT bên thực hiện", () => {
      // Bất biến thật sự đo được: hiệu ứng kho suy ra từ `by`, nên nếu một bước
      // nào đó khai thiếu hoặc khai sai `by` thì kho sẽ đổi ở nhầm xã. Kiểm
      // chính `by` mới là kiểm; so hai chiều của stockEffect thì luôn đúng theo
      // định nghĩa của hàm và không bao giờ đỏ.
      const moiBuoc = (
        ["REQUESTED", "APPROVED", "ACTIVE", "PARTIALLY_RETURNED"] as InterCommuneStatus[]
      ).flatMap((s) => allowedTransitions(s));

      expect(moiBuoc.length).toBeGreaterThan(0);
      for (const buoc of moiBuoc) {
        expect(["LENDER", "BORROWER"]).toContain(buoc.by);
        expect(["DEDUCT", "ADD", "NONE"]).toContain(buoc.stock);
      }
    });

    it("tổng số hàng ra vào của một vòng mượn–trả trọn vẹn bằng không", () => {
      // Cho mượn → nhận → trả: kho bên cho mượn trừ 1 lần, kho bên mượn cộng rồi
      // trừ. Kết thúc, cả hai kho phải về đúng như trước — trừ đúng phần hàng
      // đang nằm ở bên cho mượn chờ nhận lại.
      const vong = [
        findTransition("REQUESTED", "APPROVED")!,
        findTransition("APPROVED", "ACTIVE")!,
        findTransition("ACTIVE", "RETURNED")!,
      ];
      const diem = (huong: "OUTGOING" | "INCOMING") =>
        vong.reduce((tong, buoc) => {
          const e = stockEffect(huong, buoc);
          return tong + (e === "ADD" ? 1 : e === "DEDUCT" ? -1 : 0);
        }, 0);

      expect(diem("INCOMING")).toBe(0); // bên mượn: cộng rồi trừ → hoà
      expect(diem("OUTGOING")).toBe(-1); // bên cho mượn: đã đưa đi, chờ nhận lại
    });
  });

  it("ghi tay lúc mất mạng bắt đầu ngay ở ĐANG NỢ", () => {
    // Ghi tay nghĩa là hai bên đã thoả thuận qua điện thoại và hàng đã chuyển
    // xong. Bắt đi lại từ đầu là bấm ba nút giả cho một việc đã xong — và trong
    // lúc bấm, kho sẽ bị trừ thêm một lần nữa.
    expect(MANUAL_INITIAL_STATUS).toBe("ACTIVE");
    expect(isTerminal(MANUAL_INITIAL_STATUS)).toBe(false);
  });

  it("chiều bản ghi quyết định bên nào là ai", () => {
    expect(actorOf("OUTGOING")).toBe("LENDER");
    expect(actorOf("INCOMING")).toBe("BORROWER");
  });
});

describe("trả từng phần", () => {
  it("trả thiếu thì vẫn còn nợ, chưa đóng khoản", () => {
    // Mượn 200 chai, trả 180, hỏng mất 20 — chuyện bình thường. Ghi được-ăn-cả-
    // ngã-về-không thì hoặc phải khai khống là đã trả đủ, hoặc để nợ mở mãi mãi.
    expect(statusAfterReturn(200, 0, 180)).toEqual({
      status: "PARTIALLY_RETURNED",
      totalReturned: 180,
    });
  });

  it("trả nốt phần còn lại thì đóng khoản", () => {
    expect(statusAfterReturn(200, 180, 20)).toEqual({ status: "RETURNED", totalReturned: 200 });
  });

  it("trả làm nhiều lần vẫn cộng dồn đúng", () => {
    let da = 0;
    for (const lan of [50, 50, 50]) da = statusAfterReturn(200, da, lan).totalReturned;

    expect(da).toBe(150);
    expect(statusAfterReturn(200, da, 50).status).toBe("RETURNED");
  });

  it("CHẶN trả nhiều hơn số đã mượn", () => {
    // Trả dư là cộng vào kho bên cho mượn phần hàng chưa từng rời kho họ — tự
    // nhiên sinh ra hàng trong sổ.
    expect(() => statusAfterReturn(200, 180, 30)).toThrow(/vượt phần còn nợ/);
    expect(() => statusAfterReturn(200, 0, 201)).toThrow(/vượt phần còn nợ/);
  });

  it("CHẶN số lượng trả vô nghĩa", () => {
    expect(() => statusAfterReturn(200, 0, 0)).toThrow(/số nguyên dương/);
    expect(() => statusAfterReturn(200, 0, -5)).toThrow(/số nguyên dương/);
    expect(() => statusAfterReturn(200, 0, 1.5)).toThrow(/số nguyên dương/);
  });
});

describe("ghi tay lúc mất mạng", () => {
  it("tạo bản ghi ghi tay vẫn phải đổi kho", () => {
    // Bản ghi ghi tay bắt đầu thẳng ở ACTIVE nên KHÔNG đi qua bước mang hiệu ứng
    // kho. Thiếu chỗ này thì hàng đã chuyển ngoài đời mà sổ vẫn nguyên: bên cho
    // mượn hiện thừa hàng đã đưa đi, bên mượn thiếu hàng đang cầm trong tay.
    expect(manualEntryStockEffect("OUTGOING")).toBe("DEDUCT");
    expect(manualEntryStockEffect("INCOMING")).toBe("ADD");
  });
});

describe("bản ghi ghi tay: kho đổi theo hướng hàng thật sự đi", () => {
  it("cho mượn rồi nhận lại: trừ lúc đưa, CỘNG lúc nhận về", () => {
    // Bản ghi ghi tay không có bản ghi đối ứng ở xã kia — xã kia không đăng nhập
    // vào hệ thống này. Áp luật "bên nào thực hiện thì bên đó đổi kho" là mọi
    // bước trả đều ra NONE: hàng quay về kho ngoài đời mà sổ đứng yên.
    expect(manualEntryStockEffect("OUTGOING")).toBe("DEDUCT");
    expect(manualStockEffect("OUTGOING", "PARTIALLY_RETURNED")).toBe("ADD");
    expect(manualStockEffect("OUTGOING", "RETURNED")).toBe("ADD");
  });

  it("đi mượn rồi trả lại: cộng lúc nhận, TRỪ lúc trả đi", () => {
    expect(manualEntryStockEffect("INCOMING")).toBe("ADD");
    expect(manualStockEffect("INCOMING", "PARTIALLY_RETURNED")).toBe("DEDUCT");
    expect(manualStockEffect("INCOMING", "RETURNED")).toBe("DEDUCT");
  });

  it("một vòng ghi tay trọn vẹn đưa kho về đúng như trước", () => {
    const diem = (huong: "OUTGOING" | "INCOMING") => {
      const diem1 = manualEntryStockEffect(huong);
      const diem2 = manualStockEffect(huong, "RETURNED");
      const so = (e: string) => (e === "ADD" ? 1 : e === "DEDUCT" ? -1 : 0);
      return so(diem1) + so(diem2);
    };

    expect(diem("OUTGOING")).toBe(0);
    expect(diem("INCOMING")).toBe(0);
  });
});
