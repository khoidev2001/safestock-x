import { AssistantService } from "../assistant.service";

describe("AssistantService", () => {
  it("tự tính readiness lần đầu trước khi trả lời", async () => {
    const prisma = {
      warehouse: {
        findUnique: jest.fn().mockResolvedValue({
          id: "warehouse-central",
          name: "Kho cứu trợ trung tâm Đồng Xuân",
          communeId: "dong-xuan",
          lat: null,
          lng: null,
        }),
      },
      itemBatch: { findMany: jest.fn().mockResolvedValue([]) },
      incident: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const readiness = {
      getWarehouseScore: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({
        score: 88,
        zone: "READY",
        operationalStatus: "READY",
        blockers: [],
        recommendedActions: [],
      }),
      recalculateWarehouse: jest.fn().mockResolvedValue(undefined),
    };
    const ai = { assistantAsk: jest.fn() };
    const service = new AssistantService(
      prisma as never,
      ai as never,
      readiness as never,
      { forecastRain: jest.fn() } as never,
    );

    const result = await service.ask("warehouse-central", "Kho sẵn sàng đáp ứng được chưa?");

    expect(readiness.recalculateWarehouse).toHaveBeenCalledWith("warehouse-central");
    expect(result.answer).toContain("sẵn sàng điều phối");
    expect(ai.assistantAsk).not.toHaveBeenCalled();
  });

  it("trả lời tình huống cứu hộ ngay cả khi AI service không hoạt động", async () => {
    const prisma = {
      warehouse: {
        findUnique: jest.fn().mockResolvedValue({
          id: "warehouse-central",
          name: "Kho cứu trợ trung tâm",
          communeId: "commune-1",
          lat: null,
          lng: null,
        }),
      },
      itemBatch: { findMany: jest.fn().mockResolvedValue([]) },
      incident: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const readiness = {
      getWarehouseScore: jest.fn().mockResolvedValue({
        score: 88,
        zone: "READY",
        operationalStatus: "READY",
        blockers: [],
        recommendedActions: [],
      }),
      recalculateWarehouse: jest.fn(),
    };
    const ai = {
      assistantAsk: jest.fn().mockRejectedValue(new Error("AI service unavailable")),
    };
    const service = new AssistantService(
      prisma as never,
      ai as never,
      readiness as never,
      { forecastRain: jest.fn() } as never,
    );

    const result = await service.ask(
      "warehouse-central",
      "thôn tân bình, có 150 người mắc kẹt, mưa to, chưa rõ người già và trẻ em",
    );

    // Trợ lý ĐƯỢC phép hỏi AI để đề xuất phương án trên nền tồn kho thật; điều
    // bắt buộc là AI chết thì vẫn phải có câu trả lời dùng được, không phải là
    // không bao giờ gọi AI.
    expect(ai.assistantAsk).toHaveBeenCalled();
    expect(result.answer).toContain("150 người mắc kẹt");
    expect(result.answer).toContain("không được xem là 0");
  });

  it("trả lỗi dịch vụ thay vì báo sai rằng câu hỏi không phù hợp khi AI mất kết nối", async () => {
    const prisma = {
      warehouse: {
        findUnique: jest.fn().mockResolvedValue({
          id: "warehouse-central",
          name: "Kho cứu trợ trung tâm",
          communeId: "commune-1",
          lat: null,
          lng: null,
        }),
      },
      itemBatch: { findMany: jest.fn().mockResolvedValue([]) },
      incident: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const readiness = {
      getWarehouseScore: jest.fn().mockResolvedValue({
        score: 88,
        zone: "READY",
        operationalStatus: "READY",
        blockers: [],
        recommendedActions: [],
      }),
      recalculateWarehouse: jest.fn(),
    };
    const service = new AssistantService(
      prisma as never,
      { assistantAsk: jest.fn().mockRejectedValue(new Error("AI service unavailable")) } as never,
      readiness as never,
      { forecastRain: jest.fn() } as never,
    );

    try {
      await service.ask("warehouse-central", "Tôi nên ưu tiên việc gì hôm nay?");
      throw new Error("Expected assistant request to fail");
    } catch (error) {
      expect((error as { getStatus: () => number }).getStatus()).toBe(503);
    }
  });

  it("cơ sở dữ liệu chết thì vẫn trả lời được tình huống cứu hộ khẩn cấp", async () => {
    // Đúng lúc cần trợ lý nhất là lúc hạ tầng đang hỏng. Chụp trạng thái kho lỗi
    // không được phép làm im luôn câu trả lời.
    const prisma = {
      warehouse: { findUnique: jest.fn().mockRejectedValue(new Error("database down")) },
      itemBatch: { findMany: jest.fn() },
      incident: { findMany: jest.fn() },
    };
    const service = new AssistantService(
      prisma as never,
      { assistantAsk: jest.fn() } as never,
      { getWarehouseScore: jest.fn(), recalculateWarehouse: jest.fn() } as never,
      { forecastRain: jest.fn() } as never,
    );

    const result = await service.ask(
      "warehouse-offline",
      "thôn tân bình, có 150 người mắc kẹt, mưa to, chưa rõ người già và trẻ em",
    );

    expect(result.answer).toContain("150 người mắc kẹt");
    expect(prisma.itemBatch.findMany).not.toHaveBeenCalled();
  });

  it("kèm tín hiệu khẩn cấp để giao diện mời sang luồng điều phối", async () => {
    const service = new AssistantService(
      { warehouse: { findUnique: jest.fn().mockRejectedValue(new Error("db")) } } as never,
      { assistantAsk: jest.fn() } as never,
      {} as never,
      {} as never,
    );

    const result = await service.ask(
      "warehouse-central",
      "Thôn Tân Bình có 150 người mắc kẹt, đang mưa to.",
    );

    // Số liệu bóc tách bằng luật cố định, không nhờ AI đoán: mời sai chỗ thì
    // người dùng mất niềm tin vào chính lời mời đó.
    expect(result.emergency).toEqual({ location: "Thôn Tân Bình", affectedPeople: 150 });
  });

  it("câu hỏi tra cứu kho bình thường thì không mời điều phối", async () => {
    const service = new AssistantService(
      {
        warehouse: {
          findUnique: jest.fn().mockResolvedValue({
            id: "warehouse-central",
            name: "Kho cứu trợ trung tâm",
            communeId: "commune-1",
            lat: null,
            lng: null,
          }),
        },
        itemBatch: { findMany: jest.fn().mockResolvedValue([]) },
        incident: { findMany: jest.fn().mockResolvedValue([]) },
      } as never,
      { assistantAsk: jest.fn().mockResolvedValue("Kho còn 120 áo phao.") } as never,
      {
        getWarehouseScore: jest.fn().mockResolvedValue({
          score: 88,
          zone: "READY",
          operationalStatus: "READY",
          blockers: [],
          recommendedActions: [],
        }),
        recalculateWarehouse: jest.fn(),
      } as never,
      { forecastRain: jest.fn() } as never,
    );

    const result = await service.ask("warehouse-central", "Còn bao nhiêu áo phao người lớn?");

    expect(result.emergency).toBeUndefined();
  });
});
