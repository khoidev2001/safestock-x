import {
  type AssistantSnapshot,
  resolveAssistantFastAnswer,
} from "../assistant-fast-answer";
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
      "Trong Kho thôn Phú Xuân hiện còn 15 chiếc Áo phao người lớn.",
    );
  });

  it("trả đúng khi kho không có sự cố mở", () => {
    expect(resolveAssistantFastAnswer("Kho đang có sự cố gì không?", snapshot)).toBe(
      "Kho thôn Phú Xuân hiện không có sự cố đang mở.",
    );
  });

  it("trả trạng thái readiness không cần LLM", () => {
    expect(resolveAssistantFastAnswer("Điểm sẵn sàng của kho hiện tại?", snapshot)).toBe(
      "Kho thôn Phú Xuân hiện cần xử lý trước khi điều phối. Việc cần làm: Kiểm kê và bổ sung các vật tư đang thiếu. Điểm tham khảo 73/100.",
    );
  });

  it("hiểu câu hỏi tự nhiên về khả năng đáp ứng của kho", () => {
    expect(resolveAssistantFastAnswer("Kho sẵn sàng đáp ứng được chưa?", snapshot)).toBe(
      "Kho thôn Phú Xuân hiện cần xử lý trước khi điều phối. Việc cần làm: Kiểm kê và bổ sung các vật tư đang thiếu. Điểm tham khảo 73/100.",
    );
  });

  it("liệt kê hạn dùng gần nhất", () => {
    expect(resolveAssistantFastAnswer("Vật tư nào sắp hết hạn?", snapshot)).toBe(
      "Các vật tư có hạn dùng gần nhất tại Kho thôn Phú Xuân: Nước uống đóng chai: 2026-09-30.",
    );
  });

  it("trả dự báo thời tiết có trong snapshot", () => {
    expect(resolveAssistantFastAnswer("Ba ngày tới có mưa lớn không?", snapshot)).toBe(
      "Dự báo 72 giờ tới tại Kho thôn Phú Xuân: tổng lượng mưa 125.5 mm. Có cảnh báo mưa lớn.",
    );
  });

  it("trả lời trực tiếp tình huống có người mắc kẹt", () => {
    expect(
      resolveEmergencyAnswer(
        "thôn tân bình, có 150 người mắc kẹt, mưa to, chưa rõ người già và trẻ em",
      ),
    ).toBe(
      "Đã ghi nhận tình huống rất khẩn cấp tại thôn tân bình: 150 người mắc kẹt, đang mưa to.\n" +
        "Ưu tiên ngay: giữ liên lạc với khu vực; xác minh vị trí chính xác, mực nước và đường tiếp cận; huy động lực lượng, phương tiện cứu hộ phù hợp; chuẩn bị áo phao, sơ cứu và nước uống.\n" +
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
