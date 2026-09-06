import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from "expo-av";

/**
 * Tiếng chuông báo khi có thông báo mới — bản cho điện thoại.
 *
 * Web tự tổng hợp tiếng bằng Web Audio, nhưng React Native không có Web Audio,
 * nên ở đây phát một tệp WAV đóng kèm trong app. Tệp `assets/notification-bell.wav`
 * cũng là tiếng chuông tổng hợp sẵn (bồi âm không hài hoà, tắt dần như chuông
 * thật), nằm ngay trong gói cài nên KHÔNG cần mạng — đúng thứ phải chạy được lúc
 * bão đang mất sóng.
 *
 * Giữ đúng MỘT đối tượng âm thanh cho cả phiên: nạp lại tệp mỗi lần có thông báo
 * là tốn vài trăm mili giây, và mười thông báo dồn về là mười tài nguyên âm thanh
 * chưa kịp giải phóng.
 */
let bell: Audio.Sound | null = null;
let loading: Promise<Audio.Sound | null> | null = null;

/** To hơn tiếng của web một chút vì điện thoại thường nằm trong túi áo. */
const VOLUME = 0.85;

async function loadBell(): Promise<Audio.Sound | null> {
  if (bell) return bell;
  if (loading) return loading;
  loading = (async () => {
    try {
      // Điện thoại để ở chế độ im lặng vẫn phải nghe được: đây là chuông báo cứu
      // hộ, không phải tiếng nhạc nền. `playsInSilentModeIOS` là công tắc duy
      // nhất quyết định điều đó trên iPhone.
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
        interruptionModeIOS: InterruptionModeIOS.MixWithOthers,
        interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
      });
      // `require` một tệp tài nguyên trả về số (id asset) khi đóng gói cho điện
      // thoại, nhưng trả về object trên bản web của React Native. Lấy kiểu ngay từ
      // chữ ký của createAsync để khỏi phải chọn bừa một trong hai.
      const source = require("./assets/notification-bell.wav") as Parameters<
        typeof Audio.Sound.createAsync
      >[0];
      const { sound } = await Audio.Sound.createAsync(source, { volume: VOLUME });
      bell = sound;
      return sound;
    } catch {
      // Máy không có đầu ra âm thanh, hoặc quyền bị chặn. Thẻ thông báo vẫn hiện.
      return null;
    } finally {
      loading = null;
    }
  })();
  return loading;
}

/**
 * Phát tiếng chuông. Không phát được thì im lặng bỏ qua.
 *
 * Luôn tua về đầu trước khi phát: hai thông báo về sát nhau mà không tua thì lần
 * thứ hai bắt đầu từ chỗ tiếng trước đang ngân, nghe như bị nuốt mất.
 */
export async function playNotificationSound(): Promise<void> {
  try {
    const sound = await loadBell();
    if (!sound) return;
    await sound.setPositionAsync(0);
    await sound.playAsync();
  } catch {
    // Không để một tiếng chuông hỏng làm gãy luồng nhận thông báo.
  }
}

/** Giải phóng khi đăng xuất — giữ tài nguyên âm thanh sống mãi là rò rỉ. */
export async function releaseNotificationSound(): Promise<void> {
  const sound = bell;
  bell = null;
  if (!sound) return;
  try {
    await sound.unloadAsync();
  } catch {
    // Đã bị hệ điều hành thu hồi thì thôi.
  }
}
