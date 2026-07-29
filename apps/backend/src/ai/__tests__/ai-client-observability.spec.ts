import { HttpException, Logger } from "@nestjs/common";
import { AiClientService } from "../ai-client.service";

const config = {
  get: jest.fn().mockReturnValue("http://ai-service.test"),
};

describe("AiClientService observability and redaction", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("records bounded operation metadata without logging request PII", async () => {
    const log = jest.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ answer: "Đã xử lý" }),
    }) as never;
    const service = new AiClientService(config as never);

    await service.assistantAsk("SĐT 0945000000 của ai?", "token=super-secret");

    const record = JSON.parse(String(log.mock.calls[0][0])) as Record<string, unknown>;
    const serializedLogs = JSON.stringify(record);
    expect(record).toMatchObject({
      event: "ai_request",
      operation: "/assistant",
      outcome: "success",
    });
    expect(serializedLogs).not.toContain("0945000000");
    expect(serializedLogs).not.toContain("super-secret");
  });

  it("does not expose provider response details in logs or the HTTP error", async () => {
    const warn = jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 502,
      text: jest.fn().mockResolvedValue("provider token=secret-123; raw phone=0945000000"),
    }) as never;
    const service = new AiClientService(config as never);

    let caught: unknown;
    try {
      await service.analyzeSituation({
        description: "Thông tin nhạy cảm",
        sourceId: "mission-1",
        sourceType: "USER_REPORT",
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(HttpException);
    expect((caught as Error).message).not.toContain("secret-123");
    const record = JSON.parse(String(warn.mock.calls[0][0])) as Record<string, unknown>;
    const serializedLogs = JSON.stringify(record);
    expect(record).toMatchObject({ outcome: "http_error", status: 502 });
    expect(serializedLogs).not.toContain("secret-123");
    expect(serializedLogs).not.toContain("0945000000");
  });

  it("redacts network exception messages while retaining a safe error class", async () => {
    const errorLog = jest.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error("connect failed with token=secret-456 and raw transcript")) as never;
    const service = new AiClientService(config as never);

    await expect(
      service.analyzeFieldUpdateIntent({
        confirmedText: "Nội dung hiện trường",
        sourceId: "field-update-1",
      }),
    ).rejects.toThrow("Không kết nối được AI service");

    const record = JSON.parse(String(errorLog.mock.calls[0][0])) as Record<string, unknown>;
    const serializedLogs = JSON.stringify(record);
    expect(record).toMatchObject({ outcome: "network_error", errorClass: "Error" });
    expect(serializedLogs).not.toContain("secret-456");
    expect(serializedLogs).not.toContain("raw transcript");
  });
});
