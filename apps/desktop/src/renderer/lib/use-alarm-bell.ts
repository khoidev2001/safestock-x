import { useCallback, useEffect, useRef, useState } from "react";
import alarmSoundUrl from "../assets/canh-bao-nguy-hiem.mp3";

/**
 * Chuông cảnh báo cục bộ cho Electron renderer.
 *
 * Phát file còi báo nguy hiểm, lặp liên tục cho tới khi gọi stop(). File được
 * import nên bundler nhúng thẳng vào gói build — app đóng gói vẫn kêu khi không
 * có Internet, đúng điều kiện một kho đang mất mạng.
 *
 * Trước đây chuông dựng bằng Web Audio (hai tiếng kim loại lệch cao độ). Nghe
 * giống chuông cửa hơn là báo động, đứng giữa kho ồn thì dễ bỏ qua.
 */
export function useAlarmBell() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ringingRef = useRef(false);
  const [isRinging, setIsRinging] = useState(false);

  const getAudio = useCallback((): HTMLAudioElement => {
    if (!audioRef.current) {
      const audio = new Audio(alarmSoundUrl);
      audio.loop = true;
      audio.preload = "auto";
      audioRef.current = audio;
    }
    return audioRef.current;
  }, []);

  /**
   * Gọi từ một thao tác của người dùng (nút Đăng nhập) để thoả luật tự phát.
   *
   * Trình duyệt chặn phát âm thanh khi trang chưa được người dùng chạm vào. Nạp
   * sẵn ở đây thì lúc sự cố thật xảy ra, chuông kêu ngay chứ không bị chặn im.
   */
  const prime = useCallback(() => {
    getAudio().load();
  }, [getAudio]);

  const start = useCallback(() => {
    if (ringingRef.current) return;
    ringingRef.current = true;
    setIsRinging(true);
    const audio = getAudio();
    audio.currentTime = 0;
    void audio.play().catch(() => undefined);
  }, [getAudio]);

  const stop = useCallback(() => {
    if (!ringingRef.current) return;
    ringingRef.current = false;
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    setIsRinging(false);
  }, []);

  useEffect(
    () => () => {
      ringingRef.current = false;
      const audio = audioRef.current;
      if (audio) {
        audio.pause();
        audio.src = "";
      }
      audioRef.current = null;
    },
    [],
  );

  return { isRinging, prime, start, stop };
}
