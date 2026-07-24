import { type AssistantSnapshot, resolveAssistantFastAnswer } from "../assistant-fast-answer";
import { resolveEmergencyAnswer } from "../assistant-emergency-answer";

const snapshot: AssistantSnapshot = {
  warehouse: { name: "Kho thôn Phú Xuân", commune: "commune-1" },
  readiness: {
    score: 73,
    zone: "ATTENTION",
    operationalStatus: "NEEDS_ACTION",
    blockers: [],
    recommendedActions: ["Kiểm kê và bổ sung các vật tư đang thiếu."],
  },
  weather: { totalRainMm: 125.5, alert: true, periodHours: 72 },
  stock: [
    {
      sku: "LIFEJACKET-ADULT",
      itemName: "Áo phao người lớn",
      quantity: 15,
      unit: "chiếc",
      nearestExpiry: null,
    },
    {
      sku: "WATER-01",
      itemName: "Nước uống đóng chai",
      quantity: 120,
      unit: "chai",
      nearestExpiry: "2026-09-30",
    },
  ],
  openIncidents: [],
};

describe("resolveAssistantFastAnswer", () => {
  it("trả số lượng vật tư trực tiếp từ snapshot", () => {
    expect(resolveAssistantFastAnswer("Còn bao nhiêu áo phao người lớn?", snapshot)).toBe(
      "Dạ, Kho thôn Phú Xuân hiện còn 15 chiếc Áo phao người lớn.",
    );
  });

  it("nhắc bổ sung khi vật tư đã cạn", () => {
    const empty: AssistantSnapshot = {
      ...snapshot,
      stock: [{ sku: "RICE-01", itemName: "Gạo cứu trợ", quantity: 0, unit: "kg", nearestExpiry: null }],
    };
    expect(resolveAssistantFastAnswer("Còn bao nhiêu gạo cứu trợ?", empty)).toBe(
      "Dạ, Kho thôn Phú Xuân hiện còn 0 kg Gạo cứu trợ.\n\n" +
        "Gạo cứu trợ hiện đã cạn — anh/chị nên bổ sung sớm nếu cần điều phối.",
    );
  });

  it("trả đúng khi kho không có sự cố mở", () => {
    expect(resolveAssistantFastAnswer("Kho đang có sự cố gì không?", snapshot)).toBe(
      "Dạ, Kho thôn Phú Xuân hiện không có sự cố nào đang mở. Tình hình đang ổn.",
    );
  });

  it("trả trạng thái readiness không cần LLM", () => {
    expect(resolveAssistantFastAnswer("Điểm sẵn sàng của kho hiện tại?", snapshot)).toBe(
      "Dạ, Kho thôn Phú Xuân hiện cần xử lý trước khi điều phối, điểm sẵn sàng tham khảo là 73/100.\n\n" +
        "Việc nên làm ngay: Kiểm kê và bổ sung các vật tư đang thiếu.",
    );
  });

  it("hiểu câu hỏi tự nhiên về khả năng đáp ứng của kho", () => {
    expect(resolveAssistantFastAnswer("Kho sẵn sàng đáp ứng được chưa?", snapshot)).toBe(
      "Dạ, Kho thôn Phú Xuân hiện cần xử lý trước khi điều phối, điểm sẵn sàng tham khảo là 73/100.\n\n" +
        "Việc nên làm ngay: Kiểm kê và bổ sung các vật tư đang thiếu.",
    );
  });

  it("liệt kê hạn dùng gần nhất", () => {
    expect(resolveAssistantFastAnswer("Vật tư nào sắp hết hạn?", snapshot)).toBe(
      "Dạ, các vật tư có hạn dùng gần nhất tại Kho thôn Phú Xuân như sau:\n\n" +
        "•  Nước uống đóng chai — hạn 30/09/2026\n\n" +
        "Gần nhất là Nước uống đóng chai (hạn 30/09/2026), anh/chị nên ưu tiên kiểm tra để kịp xử lý.",
    );
  });

  it("trả dự báo thời tiết có trong snapshot", () => {
    expect(resolveAssistantFastAnswer("Ba ngày tới có mưa lớn không?", snapshot)).toBe(
      "Dạ, dự báo 3 ngày tới tại Kho thôn Phú Xuân tổng lượng mưa khoảng 125.5 mm.\n\n" +
        "Đang có cảnh báo mưa lớn — anh/chị nên rà soát phương án ứng phó và các điểm xung yếu.",
    );
  });

  it("trả lời trực tiếp tình huống có người mắc kẹt", () => {
    expect(
      resolveEmergencyAnswer(
        "thôn tân bình, có 150 người mắc kẹt, mưa to, chưa rõ người già và trẻ em",
      ),
    ).toBe(
      "Dạ, đã ghi nhận tình huống rất khẩn cấp tại thôn tân bình: 150 người mắc kẹt, đang mưa to.\n\n" +
        "Việc cần làm ngay:\n" +
        "•  Giữ liên lạc liên tục với khu vực.\n" +
        "•  Xác minh vị trí chính xác, mực nước và đường tiếp cận.\n" +
        "•  Huy động lực lượng, phương tiện cứu hộ phù hợp.\n" +
        "•  Chuẩn bị áo phao, sơ cứu và nước uống.\n\n" +
        "Chưa rõ số người già và trẻ em — không được xem là 0; cần thống kê ngay cùng số người bị thương hoặc cần hỗ trợ y tế.",
    );
  });

  it("đưa hướng xử lý phù hợp với tình huống cháy", () => {
    const answer = resolveEmergencyAnswer("khu phố 2 có 12 người mắc kẹt do cháy lớn");

    expect(answer).toContain("tại khu phố 2: 12 người mắc kẹt");
    expect(answer).toContain("nguồn cháy, khói và lối thoát");
    expect(answer).not.toContain("mực nước");
    expect(answer).not.toContain("áo phao");
  });

  it("chuyển câu hỏi mở sang LLM", () => {
    expect(resolveAssistantFastAnswer("Tôi nên ưu tiên việc gì hôm nay?", snapshot)).toBeNull();
  });
});
