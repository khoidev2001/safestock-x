/**
 * Ghi âm trình duyệt → WAV PCM 16-bit, 16kHz, mono, base64 — định dạng PhoWhisper cần.
 * Dùng Web Audio API để giải mã + hạ tần số, KHÔNG phụ thuộc ffmpeg hay thư viện ngoài.
 */

const TARGET_SR = 16_000;

/** Trộn nhiều kênh về mono (trung bình các kênh). */
function toMono(buffer: AudioBuffer): Float32Array {
  const channels = buffer.numberOfChannels;
  if (channels === 1) return buffer.getChannelData(0);
  const len = buffer.length;
  const out = new Float32Array(len);
  for (let c = 0; c < channels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < len; i++) out[i] += data[i] / channels;
  }
  return out;
}

/** Hạ tần số mẫu về 16kHz bằng nội suy tuyến tính (đủ tốt cho tiếng nói). */
function resampleTo16k(input: Float32Array, inputSr: number): Float32Array {
  if (inputSr === TARGET_SR) return input;
  const ratio = inputSr / TARGET_SR;
  const outLen = Math.max(1, Math.round(input.length / ratio));
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const pos = i * ratio;
    const idx = Math.floor(pos);
    const frac = pos - idx;
    const a = input[idx] ?? 0;
    const b = input[idx + 1] ?? a;
    out[i] = a + (b - a) * frac;
  }
  return out;
}

/** Float32 [-1,1] → WAV PCM 16-bit mono. */
function encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true); // kích thước khối fmt (PCM)
  view.setUint16(20, 1, true); // định dạng PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate = sr * blockAlign
  view.setUint16(32, 2, true); // block align = channels * bytesPerSample
  view.setUint16(34, 16, true); // bit/mẫu
  writeStr(36, "data");
  view.setUint32(40, samples.length * 2, true);
  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }
  return buffer;
}

/** ArrayBuffer → base64, xử lý theo khối để tránh tràn ngăn xếp với file lớn. */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/**
 * Ngưỡng coi như đoạn ghi không có tiếng. Bằng đúng ngưỡng phía AI service
 * (`_SILENCE_RMS` trong transcribe.py) để hai bên không kết luận trái nhau.
 */
export const SILENCE_RMS = 0.0015;

/** Biên độ trung bình bình phương của đoạn ghi (0…1). */
export function measureRms(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / samples.length);
}

export interface WavRecording {
  base64: string;
  /** Độ to trung bình. Bằng 0 nghĩa là micro trả về im lặng số học, không phải phòng yên. */
  rms: number;
  seconds: number;
}

/**
 * Blob ghi âm (webm/ogg/mp4… tuỳ trình duyệt) → WAV 16kHz mono base64.
 * decodeAudioData tự lo codec đầu vào nên không cần biết định dạng gốc.
 *
 * Trả kèm độ to, vì đó là thứ phân biệt được hai hỏng hóc trông y hệt nhau:
 * micro không thu được gì (rms = 0, nhưng vẫn đủ số giây) khác hẳn với model
 * nghe mà không ra chữ. Không đo thì cả hai đều hiện "chưa nghe rõ nội dung",
 * và người dùng đi sửa nhầm chỗ.
 */
export async function blobToWavBase64(blob: Blob): Promise<WavRecording> {
  const arrayBuffer = await blob.arrayBuffer();
  const AudioCtx =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AudioCtx();
  try {
    const decoded = await ctx.decodeAudioData(arrayBuffer);
    const mono = toMono(decoded);
    const resampled = resampleTo16k(mono, decoded.sampleRate);
    return {
      base64: arrayBufferToBase64(encodeWav(resampled, TARGET_SR)),
      rms: measureRms(resampled),
      seconds: resampled.length / TARGET_SR,
    };
  } finally {
    void ctx.close();
  }
}
