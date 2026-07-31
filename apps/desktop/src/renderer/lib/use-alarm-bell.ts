import { useCallback, useEffect, useRef, useState } from "react";

const BELL_REPEAT_MS = 1_550;
const BELL_DURATION_SECONDS = 1.08;

/**
 * Chuông cảnh báo cục bộ cho Electron renderer.
 *
 * Mỗi chu kỳ gồm hai tiếng chuông kim loại lệch cao độ. Âm thanh được tạo bằng
 * Web Audio thay vì phụ thuộc vào file media ngoài, nên app đóng gói vẫn kêu
 * được khi không có Internet. Chuông chỉ dừng khi gọi stop() hoặc app đóng.
 */
export function useAlarmBell() {
  const contextRef = useRef<AudioContext | null>(null);
  const intervalRef = useRef<number | null>(null);
  const voicesRef = useRef<OscillatorNode[]>([]);
  const ringingRef = useRef(false);
  const [isRinging, setIsRinging] = useState(false);

  const getContext = useCallback((): AudioContext | null => {
    if (!window.AudioContext) return null;
    if (!contextRef.current || contextRef.current.state === "closed") {
      contextRef.current = new window.AudioContext();
    }
    return contextRef.current;
  }, []);

  const stopVoices = useCallback(() => {
    for (const voice of voicesRef.current) {
      try {
        voice.stop();
      } catch {
        // Voice có thể đã tự dừng theo lịch; không cần xử lý thêm.
      }
    }
    voicesRef.current = [];
  }, []);

  const strike = useCallback((context: AudioContext, at: number, baseFrequency: number) => {
    // Các harmonic không đều tạo âm kim loại thay vì tiếng bíp đơn thuần.
    for (const [multiplier, volume] of [
      [1, 0.16],
      [2.01, 0.075],
      [2.72, 0.035],
    ] as const) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(baseFrequency * multiplier, at);
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(volume, at + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.52);
      oscillator.connect(gain).connect(context.destination);
      oscillator.addEventListener("ended", () => {
        voicesRef.current = voicesRef.current.filter((voice) => voice !== oscillator);
      });
      oscillator.start(at);
      oscillator.stop(at + BELL_DURATION_SECONDS);
      voicesRef.current.push(oscillator);
    }
  }, []);

  const ringOnce = useCallback(() => {
    if (!ringingRef.current) return;
    const context = getContext();
    if (!context) return;
    const start = context.currentTime + 0.02;
    strike(context, start, 880);
    strike(context, start + 0.34, 1_046.5);
  }, [getContext, strike]);

  /** Call this from a user gesture (for example the login button) to satisfy autoplay rules. */
  const prime = useCallback(() => {
    const context = getContext();
    if (context) void context.resume().catch(() => undefined);
  }, [getContext]);

  const start = useCallback(() => {
    if (ringingRef.current) return;
    const context = getContext();
    if (!context) return;

    ringingRef.current = true;
    setIsRinging(true);
    void context
      .resume()
      .then(ringOnce)
      .catch(() => undefined);
    intervalRef.current = window.setInterval(ringOnce, BELL_REPEAT_MS);
  }, [getContext, ringOnce]);

  const stop = useCallback(() => {
    if (!ringingRef.current) return;
    ringingRef.current = false;
    if (intervalRef.current !== null) window.clearInterval(intervalRef.current);
    intervalRef.current = null;
    stopVoices();
    setIsRinging(false);
  }, [stopVoices]);

  useEffect(
    () => () => {
      stop();
      const context = contextRef.current;
      if (context && context.state !== "closed") void context.close();
    },
    [stop],
  );

  return { isRinging, prime, start, stop };
}
