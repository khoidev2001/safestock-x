import {
  type AssistantSnapshot,
  resolveAssistantFastAnswer,
} from "../assistant-fast-answer";

const snapshot: AssistantSnapshot = {
  warehouse: { name: "Kho thôn Phú Xuân", commune: "commune-1" },
  readiness: { score: 73, zone: "ATTENTION" },
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

  it("trả điểm readiness không cần LLM", () => {
    expect(resolveAssistantFastAnswer("Điểm sẵn sàng của kho hiện tại?", snapshot)).toBe(
      "Điểm sẵn sàng của Kho thôn Phú Xuân hiện là 73/100, mức cần chú ý.",
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

  it("chuyển câu hỏi mở sang LLM", () => {
    expect(resolveAssistantFastAnswer("Tôi nên ưu tiên việc gì hôm nay?", snapshot)).toBeNull();
  });
});
