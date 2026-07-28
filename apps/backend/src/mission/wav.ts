import { BadRequestException } from "@nestjs/common";

export const MAX_WAV_BYTES = 5 * 1024 * 1024;
export const MAX_WAV_BASE64_LENGTH = 4 * Math.ceil(MAX_WAV_BYTES / 3);
const PCM_FORMAT = 1;
const MONO_CHANNELS = 1;
const SAMPLE_RATE_HZ = 16_000;
const BITS_PER_SAMPLE = 16;
const MIN_WAV_BYTES = 44;
const STRICT_BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export interface ValidatedWav {
  bytes: Buffer;
  byteLength: number;
  durationMs: number;
}

export function validateAndDecodeWav(audioBase64: string, mimeType: string): ValidatedWav {
  if (mimeType !== "audio/wav") {
    throw invalidAudio("Định dạng âm thanh phải là audio/wav");
  }
  if (!audioBase64 || audioBase64.length > MAX_WAV_BASE64_LENGTH || audioBase64.length % 4 !== 0) {
    throw invalidAudio("Dữ liệu WAV trống hoặc vượt quá giới hạn 5 MiB");
  }
  if (!STRICT_BASE64.test(audioBase64)) {
    throw invalidAudio("Dữ liệu âm thanh không phải base64 hợp lệ");
  }

  const padding = audioBase64.endsWith("==") ? 2 : audioBase64.endsWith("=") ? 1 : 0;
  const decodedLength = (audioBase64.length / 4) * 3 - padding;
  if (decodedLength < MIN_WAV_BYTES || decodedLength > MAX_WAV_BYTES) {
    throw invalidAudio("Dữ liệu WAV trống hoặc vượt quá giới hạn 5 MiB");
  }

  const bytes = Buffer.from(audioBase64, "base64");
  if (bytes.length !== decodedLength || bytes.length > MAX_WAV_BYTES) {
    throw invalidAudio("Dữ liệu âm thanh không phải base64 hợp lệ");
  }
  return inspectWav(bytes);
}

function inspectWav(bytes: Buffer): ValidatedWav {
  if (ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 12) !== "WAVE") {
    throw invalidAudio("Tệp âm thanh không phải RIFF/WAVE hợp lệ");
  }
  const riffSize = bytes.readUInt32LE(4);
  if (riffSize !== bytes.length - 8) {
    throw invalidAudio("Kích thước RIFF không khớp dữ liệu WAV");
  }

  let offset = 12;
  let hasPcmFormat = false;
  let byteRate = 0;
  let dataLength: number | null = null;

  while (offset < bytes.length) {
    if (offset + 8 > bytes.length) throw invalidAudio("Header chunk WAV bị cắt ngắn");
    const chunkId = ascii(bytes, offset, offset + 4);
    const chunkSize = bytes.readUInt32LE(offset + 4);
    const dataStart = offset + 8;
    const dataEnd = dataStart + chunkSize;
    if (dataEnd > bytes.length) throw invalidAudio("Kích thước chunk WAV vượt quá tệp");

    if (chunkId === "fmt ") {
      if (hasPcmFormat || chunkSize < 16) throw invalidAudio("Chunk fmt WAV không hợp lệ");
      const audioFormat = bytes.readUInt16LE(dataStart);
      const channels = bytes.readUInt16LE(dataStart + 2);
      const sampleRate = bytes.readUInt32LE(dataStart + 4);
      byteRate = bytes.readUInt32LE(dataStart + 8);
      const blockAlign = bytes.readUInt16LE(dataStart + 12);
      const bitsPerSample = bytes.readUInt16LE(dataStart + 14);
      const expectedBlockAlign = (MONO_CHANNELS * BITS_PER_SAMPLE) / 8;
      const expectedByteRate = SAMPLE_RATE_HZ * expectedBlockAlign;
      if (
        audioFormat !== PCM_FORMAT ||
        channels !== MONO_CHANNELS ||
        sampleRate !== SAMPLE_RATE_HZ ||
        bitsPerSample !== BITS_PER_SAMPLE ||
        blockAlign !== expectedBlockAlign ||
        byteRate !== expectedByteRate
      ) {
        throw invalidAudio("WAV phải là PCM mono 16 kHz, 16-bit");
      }
      hasPcmFormat = true;
    } else if (chunkId === "data") {
      if (dataLength != null || chunkSize === 0) throw invalidAudio("Chunk data WAV không hợp lệ");
      if (chunkSize % ((MONO_CHANNELS * BITS_PER_SAMPLE) / 8) !== 0) {
        throw invalidAudio("Chunk data WAV không thẳng hàng PCM");
      }
      dataLength = chunkSize;
    }

    offset = dataEnd + (chunkSize % 2);
    if (offset > bytes.length) throw invalidAudio("Padding chunk WAV vượt quá tệp");
  }

  if (offset !== bytes.length || !hasPcmFormat || dataLength == null || byteRate === 0) {
    throw invalidAudio("WAV thiếu chunk fmt hoặc data hợp lệ");
  }
  return {
    bytes,
    byteLength: bytes.length,
    durationMs: Math.round((dataLength / byteRate) * 1000),
  };
}

function ascii(bytes: Buffer, start: number, end: number): string {
  return bytes.toString("ascii", start, end);
}

function invalidAudio(message: string): BadRequestException {
  return new BadRequestException(message);
}
