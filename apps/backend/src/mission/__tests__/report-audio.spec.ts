import { decodeReportAudio, MAX_REPORT_AUDIO_BYTES } from "../report-audio";

/** WAV hợp lệ tối thiểu: "RIFF" + 4 byte cỡ + "WAVE". */
function wav(extraBytes = 0): string {
  const header = Buffer.concat([
    Buffer.from("RIFF", "ascii"),
    Buffer.from([0, 0, 0, 0]),
    Buffer.from("WAVE", "ascii"),
  ]);
  return Buffer.concat([header, Buffer.alloc(extraBytes)]).toString("base64");
}

describe("decodeReportAudio", () => {
  it("không có ghi âm là chuyện bình thường, không phải lỗi", () => {
    expect(decodeReportAudio(undefined)).toEqual({ ok: true, audio: null });
    expect(decodeReportAudio({ base64: "   " })).toEqual({ ok: true, audio: null });
  });

  it("nhận WAV và tự xác định định dạng từ byte đầu tệp", () => {
    const result = decodeReportAudio({ base64: wav(32) });
    expect(result).toMatchObject({ ok: true });
    if (!result.ok || !result.audio) throw new Error("phải giải mã được");
    expect(result.audio.mimeType).toBe("audio/wav");
    expect(result.audio.buffer.length).toBe(44);
  });

  it("chấp nhận cả dạng data URL mà trình duyệt hay gửi", () => {
    const result = decodeReportAudio({ base64: `data:audio/wav;base64,${wav(8)}` });
    expect(result).toMatchObject({ ok: true });
    if (!result.ok || !result.audio) throw new Error("phải giải mã được");
    expect(result.audio.mimeType).toBe("audio/wav");
  });

  it("nhận WebM và MP4 — hai định dạng trình duyệt ghi ra", () => {
    const webm = Buffer.concat([Buffer.from("1a45dfa3", "hex"), Buffer.alloc(8)]);
    const mp4 = Buffer.concat([
      Buffer.alloc(4),
      Buffer.from("ftyp", "ascii"),
      Buffer.alloc(8),
    ]);
    expect(decodeReportAudio({ base64: webm.toString("base64") })).toMatchObject({
      ok: true,
      audio: { mimeType: "audio/webm" },
    });
    expect(decodeReportAudio({ base64: mp4.toString("base64") })).toMatchObject({
      ok: true,
      audio: { mimeType: "audio/mp4" },
    });
  });

  it("từ chối tệp tự xưng là âm thanh — định dạng đọc từ byte, không từ lời khai", () => {
    // Một trang HTML gửi kèm nhãn `data:audio/wav`. Tin lời khai là để nó chạy
    // trong trình duyệt của người điều phối.
    const html = Buffer.from("<html><script>alert(1)</script></html>", "utf8");
    expect(
      decodeReportAudio({ base64: `data:audio/wav;base64,${html.toString("base64")}` }),
    ).toEqual({
      ok: false,
      message: "Định dạng ghi âm không được hỗ trợ.",
    });
  });

  it("từ chối bản ghi vượt trần dung lượng", () => {
    const tooBig = decodeReportAudio({ base64: wav(MAX_REPORT_AUDIO_BYTES) });
    expect(tooBig).toMatchObject({ ok: false });
  });
});
