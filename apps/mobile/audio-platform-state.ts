export type RecordingBackend = "ANDROID_NATIVE" | "WEB" | "UNSUPPORTED";

export const MAX_RECORDING_MS = 60_000;

export function selectRecordingBackend(
  platform: string,
  nativeRecorderAvailable: boolean,
  webRecorderAvailable: boolean,
): RecordingBackend {
  if (platform === "android") {
    return nativeRecorderAvailable ? "ANDROID_NATIVE" : "UNSUPPORTED";
  }
  if (platform === "web") {
    return webRecorderAvailable ? "WEB" : "UNSUPPORTED";
  }
  return "UNSUPPORTED";
}
