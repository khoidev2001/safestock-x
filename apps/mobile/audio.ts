/**
 * Ghi âm giọng nói → WAV PCM 16-bit, 16kHz, mono, base64 — đúng định dạng PhoWhisper cần.
 *
 * CHỈ chạy trên Expo Web (React Native Web): dùng thẳng browser API
 * (getUserMedia + MediaRecorder + Web Audio decodeAudioData), y hệt frontend web.
 * Trên native (iOS/Android) các API này không có → `isRecordingSupported()` trả false,
 * màn báo cáo tự ẩn nút ghi âm và người dùng gõ tay.
 *
 * Vì sao không dùng expo-audio: nó ghi ra .m4a/AAC mà soundfile (ai-service) KHÔNG đọc
 * được nếu thiếu ffmpeg, và trên web nó cũng chỉ bọc lại MediaRecorder. Dùng thẳng
 * Web Audio cho WAV chuẩn là đường chắc chắn nhất cho bản demo (chạy trên trình duyệt).
 */

const TARGET_SR = 16_000;

/** Có đủ API trình duyệt để ghi âm + mã hoá WAV không (chỉ đúng trên web). */
export function isRecordingSupported(): boolean {
  if (typeof navigator === "undefined" || typeof window === "undefined") return false;
  const w = window as unknown as { AudioContext?: unknown; webkitAudioContext?: unknown };
  return (
    Boolean(navigator.mediaDevices?.getUserMedia) &&
    typeof MediaRecorder !== "undefined" &&
    Boolean(w.AudioContext ?? w.webkitAudioContext)
  );
}

/** Trộn nhiều kênh về mono (trung bình các kênh). */
function toMono(buffer: AudioBuffer): Float32Array {
  const channels = buffer.numberOfChannels;
  if (channels === 1) return buffer.getChannelData(0);
  const len = buffer.length;
  const out = new Float32Array(len);
  for (let ch = 0; ch < channels; ch++) {
    const data = buffer.getChannelData(ch);
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

/** ArrayBuffer → base64, xử lý theo khối để tránh tràn ngăn xếp với clip dài. */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/** Blob ghi âm (webm/ogg/mp4… tuỳ trình duyệt) → WAV 16kHz mono base64. */
async function blobToWavBase64(blob: Blob): Promise<string> {
  const arrayBuffer = await blob.arrayBuffer();
  const AudioCtx =
    (window as unknown as { AudioContext: typeof AudioContext }).AudioContext ??
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AudioCtx();
  try {
    const decoded = await ctx.decodeAudioData(arrayBuffer);
    const mono = toMono(decoded);
    const resampled = resampleTo16k(mono, decoded.sampleRate);
    return arrayBufferToBase64(encodeWav(resampled, TARGET_SR));
  } finally {
    await ctx.close().catch(() => undefined);
  }
}

export interface RecordedAudio {
  base64: string;
  mimeType: "audio/wav";
}

/**
 * Điều khiển ghi âm 1 lần: start() mở mic, stop() dừng và trả WAV cùng MIME.
 * Người gọi giữ riêng clip gốc với transcript có thể chỉnh sửa.
 */
export interface AudioRecording {
  stop: () => Promise<RecordedAudio | null>;
}

/** Bắt đầu ghi âm; stop() trả WAV 16kHz hoặc null khi clip trống. */
export async function startRecording(): Promise<AudioRecording> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const chunks: Blob[] = [];
  const recorder = new MediaRecorder(stream);
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  recorder.start();

  return {
    stop: () =>
      new Promise<RecordedAudio | null>((resolve, reject) => {
        recorder.onstop = async () => {
          stream.getTracks().forEach((t) => t.stop());
          const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
          if (blob.size === 0) return resolve(null);
          try {
            const base64 = await blobToWavBase64(blob);
            resolve({ base64, mimeType: "audio/wav" });
          } catch (err) {
            reject(err);
          }
        };
        recorder.stop();
      }),
  };
}
