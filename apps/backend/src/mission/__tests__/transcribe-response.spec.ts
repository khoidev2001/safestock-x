import { MissionController } from "../mission.controller";

/**
 * Nhận dạng giọng nói phải trả JSON `{ text }`.
 *
 * Trả chuỗi trần thì Nest serialize thành `text/html`; web và điện thoại đều gọi
 * `res.json()` rồi đọc `.text`, parse hỏng, và chúng bắt lỗi chung nên hiện ra
 * "Nhận dạng giọng nói chưa sẵn sàng" — người dùng tưởng AI chết trong khi nhận
 * dạng chạy đúng. Lỗi này đã xảy ra thật trên máy demo.
 */
describe("MissionController.transcribe", () => {
  function makeController(text: string) {
    const ai = { transcribe: jest.fn().mockResolvedValue(text) };
    const controller = new MissionController(
      {} as never,
      ai as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never, {} as never,
    );
    return { controller, ai };
  }

  it("bọc kết quả trong { text } để client parse được JSON", async () => {
    const { controller } = makeController("Lũ quét ở thôn Long Châu.");

    const result = await controller.transcribe({ audioBase64: "AAAA" } as never);

    expect(result).toEqual({ text: "Lũ quét ở thôn Long Châu." });
    expect(typeof result).toBe("object");
  });

  it("mặc định định dạng WAV khi client không nói rõ", async () => {
    const { controller, ai } = makeController("xin chào");

    await controller.transcribe({ audioBase64: "AAAA" } as never);

    expect(ai.transcribe).toHaveBeenCalledWith("AAAA", "audio/wav");
  });

  it("nhận dạng ra chuỗi rỗng vẫn là JSON hợp lệ, không phải chuỗi trần", async () => {
    const { controller } = makeController("");

    const result = await controller.transcribe({ audioBase64: "AAAA" } as never);

    expect(result).toEqual({ text: "" });
  });
});
