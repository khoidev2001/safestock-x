import { BadRequestException } from "@nestjs/common";
import { validateAndDecodeWav } from "../wav";

function pcmWav(sampleCount = 160): Buffer {
  const bytes = Buffer.alloc(44 + sampleCount * 2);
  bytes.write("RIFF", 0, "ascii");
  bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write("WAVE", 8, "ascii");
  bytes.write("fmt ", 12, "ascii");
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(16_000, 24);
  bytes.writeUInt32LE(32_000, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write("data", 36, "ascii");
  bytes.writeUInt32LE(sampleCount * 2, 40);
  return bytes;
}

describe("validateAndDecodeWav", () => {
  it("chấp nhận WAV PCM mono 16 kHz 16-bit và tính duration từ data chunk", () => {
    const wav = pcmWav(1_600);

    expect(validateAndDecodeWav(wav.toString("base64"), "audio/wav")).toEqual({
      bytes: wav,
      byteLength: wav.length,
      durationMs: 100,
    });
  });

  it.each([
    ["mime khác WAV", pcmWav().toString("base64"), "audio/webm"],
    ["base64 không canonical", "not-base64", "audio/wav"],
    ["RIFF size bị sửa", (() => { const wav = pcmWav(); wav.writeUInt32LE(0, 4); return wav.toString("base64"); })(), "audio/wav"],
    ["stereo", (() => { const wav = pcmWav(); wav.writeUInt16LE(2, 22); return wav.toString("base64"); })(), "audio/wav"],
    ["data lệch block PCM", (() => { const wav = pcmWav(); const odd = Buffer.concat([wav, Buffer.alloc(1)]); odd.writeUInt32LE(odd.length - 8, 4); odd.writeUInt32LE(odd.length - 44, 40); return odd.toString("base64"); })(), "audio/wav"],
  ])("từ chối %s", (_label, audioBase64, mimeType) => {
    expect(() => validateAndDecodeWav(audioBase64, mimeType)).toThrow(BadRequestException);
  });
});
