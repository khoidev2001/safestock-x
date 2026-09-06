import { findHamletInReport, type HamletNameCandidate } from "../hamlet-in-report";

const hamlet = (id: string, name: string): HamletNameCandidate => ({
  id,
  name,
  aliases: [name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").toLowerCase()],
});

const HAMLETS: HamletNameCandidate[] = [
  hamlet("h1", "Tân Bình"),
  hamlet("h2", "Tân Phú"),
  hamlet("h3", "Tân Phước"),
  hamlet("h4", "Long Châu"),
  hamlet("h5", "Triêm Đức"),
  hamlet("h6", "Kỳ Đu"),
];

describe("findHamletInReport", () => {
  it("nhận ra tên thôn dù KHÔNG có chữ “thôn” đứng trước", () => {
    // Người trong xã gần như không bao giờ nói chữ "thôn". Bỏ sót ở đây không chỉ
    // mất một trường dữ liệu — nó chặn đứng cả phương án.
    expect(findHamletInReport("lũ lụt ở tân bình, cô lập 120 người", HAMLETS)?.name).toBe(
      "Tân Bình",
    );
  });

  it("vẫn nhận khi có chữ “thôn” và khi viết hoa đầy đủ", () => {
    expect(findHamletInReport("Sạt lở tại thôn Triêm Đức", HAMLETS)?.name).toBe("Triêm Đức");
    expect(findHamletInReport("ngập ở KỲ ĐU từ sáng", HAMLETS)?.name).toBe("Kỳ Đu");
  });

  it("KHÔNG nhận nhầm Tân Phước thành Tân Phú", () => {
    // "tan phu" nằm gọn bên trong "tan phuoc". So kiểu chứa chuỗi là điều phối
    // hàng cứu trợ sang một thôn khác hẳn, mà nhìn vào không thấy gì bất thường.
    expect(findHamletInReport("lụt ở tân phước, 200 người mắc kẹt", HAMLETS)?.name).toBe(
      "Tân Phước",
    );
  });

  it("nhắc hai thôn thì không tự chọn", () => {
    expect(findHamletInReport("ngập cả tân bình lẫn long châu", HAMLETS)).toBeNull();
  });

  it("không nhắc thôn nào thì trả null", () => {
    expect(findHamletInReport("có sự cố, chưa rõ ở đâu", HAMLETS)).toBeNull();
  });

  it("lời kể rỗng không làm vỡ", () => {
    expect(findHamletInReport("", HAMLETS)).toBeNull();
    expect(findHamletInReport("   ", HAMLETS)).toBeNull();
  });

  it("danh mục rỗng thì trả null, không ném", () => {
    expect(findHamletInReport("lũ ở tân bình", [])).toBeNull();
  });

  it("không nhận nhầm khi tên thôn chỉ là một phần của từ khác", () => {
    // "tân" đứng riêng không phải tên thôn nào; chỉ cả cụm mới tính.
    expect(findHamletInReport("khu vực tân lập bị ngập", HAMLETS)).toBeNull();
  });
});
