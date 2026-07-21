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
      getWarehouseScore: jest
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
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

    const result = await service.ask(
      "warehouse-central",
      "Kho sẵn sàng đáp ứng được chưa?",
    );

    expect(readiness.recalculateWarehouse).toHaveBeenCalledWith("warehouse-central");
    expect(result.answer).toContain("sẵn sàng điều phối");
    expect(ai.assistantAsk).not.toHaveBeenCalled();
  });
});
