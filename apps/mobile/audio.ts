import { NativeModules, PermissionsAndroid, Platform } from "react-native";
import { selectRecordingBackend } from "./audio-platform-state";

/**
 * Ghi âm giọng nói → WAV PCM 16-bit, 16kHz, mono, base64 — đúng định dạng PhoWhisper cần.
 *
 * Android APK dùng native AudioRecord. Expo Web giữ đường MediaRecorder + Web Audio.
 * iOS chưa có recorder native nên vẫn dùng nhập tay.
 */

const TARGET_SR = 16_000;

interface NativeVoiceRecorder {
  start: () => Promise<void>;
  stop: () => Promise<string>;
}

function nativeVoiceRecorder(): NativeVoiceRecorder | null {
  const recorder = NativeModules.VoiceRecorder as Partial<NativeVoiceRecorder> | undefined;
  return typeof recorder?.start === "function" && typeof recorder.stop === "function"
    ? (recorder as NativeVoiceRecorder)
    : null;
}

function isWebRecordingSupported(): boolean {
  if (typeof navigator === "undefined" || typeof window === "undefined") return false;
  const w = window as unknown as { AudioContext?: unknown; webkitAudioContext?: unknown };
  return (
    Boolean(navigator.mediaDevices?.getUserMedia) &&
    typeof MediaRecorder !== "undefined" &&
    Boolean(w.AudioContext ?? w.webkitAudioContext)
  );
}

/** Có recorder phù hợp với đúng runtime hiện tại hay không. */
export function isRecordingSupported(): boolean {
  return (
    selectRecordingBackend(
      Platform.OS,
      Boolean(nativeVoiceRecorder()),
      isWebRecordingSupported(),
    ) !== "UNSUPPORTED"
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
    void ctx.close();
  }
}

/**
 * Điều khiển ghi âm 1 lần: start() mở mic, stop() dừng và trả WAV base64 (hoặc "" nếu trống).
 * Người gọi tự quản trạng thái UI (idle/recording/transcribing).
 */
export interface AudioRecording {
  stop: () => Promise<string>;
}

/** Bắt đầu ghi âm; trả handle có stop() → WAV base64. Ném lỗi nếu không mở được mic. */
export async function startRecording(): Promise<AudioRecording> {
  const nativeRecorder = nativeVoiceRecorder();
  const backend = selectRecordingBackend(
    Platform.OS,
    Boolean(nativeRecorder),
    isWebRecordingSupported(),
  );

  if (backend === "ANDROID_NATIVE") {
    const permission = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      {
        title: "Cho phép ghi âm mô tả",
        message:
          "SafeStock cần dùng micro khi bạn bấm ghi âm để chuyển lời nói thành nội dung báo cáo.",
        buttonPositive: "Cho phép",
        buttonNegative: "Không cho phép",
      },
    );
    if (permission !== PermissionsAndroid.RESULTS.GRANTED) {
      throw new Error("Quyền micro chưa được cấp.");
    }

    await nativeRecorder!.start();
    let stopped = false;
    return {
      stop: async () => {
        if (stopped) return "";
        stopped = true;
        return nativeRecorder!.stop();
      },
    };
  }

  if (backend !== "WEB") {
    throw new Error("Thiết bị này chưa hỗ trợ ghi âm.");
  }

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const chunks: Blob[] = [];
  const recorder = new MediaRecorder(stream);
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  recorder.start();

  return {
    stop: () =>
      new Promise<string>((resolve, reject) => {
        recorder.onstop = async () => {
          stream.getTracks().forEach((t) => t.stop());
          const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
          if (blob.size === 0) return resolve("");
          try {
            resolve(await blobToWavBase64(blob));
          } catch (err) {
            reject(err);
          }
        };
        recorder.stop();
      }),
  };
}
