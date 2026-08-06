import {
  actorOf,
  allowedTransitions,
  findTransition,
  isTerminal,
  MANUAL_INITIAL_STATUS,
  stockEffect,
  type LoanStatus,
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
    for (const status of ["REJECTED", "CANCELLED", "RETURNED"] as LoanStatus[]) {
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

    it("mỗi bước chỉ đổi kho của ĐÚNG MỘT xã", () => {
      // Chốt bất biến của cả tính năng: không bước nào được đụng kho cả hai bên.
      // Đụng cả hai là hàng tự nhân đôi hoặc tự bốc hơi.
      const moiBuoc = (["REQUESTED", "APPROVED", "ACTIVE"] as LoanStatus[]).flatMap((s) =>
        allowedTransitions(s),
      );

      for (const buoc of moiBuoc) {
        const doi = [stockEffect("OUTGOING", buoc), stockEffect("INCOMING", buoc)].filter(
          (e) => e !== "NONE",
        );
        expect(doi.length).toBeLessThanOrEqual(1);
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
