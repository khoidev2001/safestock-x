/**
 * Tiếng chuông báo có thông báo mới.
 *
 * Dựng bằng Web Audio chứ không tải file mp3: một tệp âm thanh là thêm một thứ
 * phải nằm đúng chỗ khi đóng gói và phải tải về đúng lúc mạng đang yếu — mà lúc
 * đang bão thì mạng yếu là chuyện thường. Hai nốt sin ngắn thì không cần tải gì.
 *
 * Tiếng CHUÔNG, không phải tiếng "tinh tinh" của chuông cửa điện tử: một cú gõ
 * rồi ngân tắt dần trong khoảng một giây.
 *
 * Vẫn cố ý không gắt. Tiếng báo chói phát mỗi lần có tin sẽ bị người trực tắt loa
 * sau nửa buổi, và từ đó mọi cảnh báo về sau đều câm.
 *
 * Trình duyệt CHẶN phát tiếng khi người dùng chưa tương tác với trang. Đây là
 * hành vi đúng của trình duyệt, không phải lỗi để sửa: cứ thử phát, không được
 * thì im lặng bỏ qua — thẻ thông báo vẫn hiện, chỉ là không kèm tiếng.
 */

let sharedContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Constructor =
    window.AudioContext ??
    (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Constructor) return null;
  // Dùng lại một context duy nhất: mỗi lần `new AudioContext()` là một tài
  // nguyên âm thanh mới, mở vài chục cái trong một buổi trực là trình duyệt
  // ngừng cấp thêm và từ đó không còn tiếng nào nữa.
  if (!sharedContext) sharedContext = new Constructor();
  return sharedContext;
}

/**
 * Các bồi âm của một cú gõ chuông.
 *
 * Chuông KHÔNG phải một nốt sin. Nó rung ra nhiều bồi âm không hài hoà — tỉ lệ
 * lẻ so với tần số gốc chứ không phải bội số nguyên như dây đàn — và bồi âm càng
 * cao thì tắt càng nhanh. Chính chỗ đó tạo tiếng "keng" sắc lúc đầu rồi ngân dài
 * ở nốt gốc. Ghép hai nốt sin như bản trước nghe ra tiếng chuông cửa điện tử, đúng
 * nghĩa "tinh tinh", không phải tiếng chuông.
 *
 * Bộ tỉ lệ này lấy theo phổ đo được của chuông nhỏ, cũng chính là bộ dùng để tổng
 * hợp tệp WAV bên app điện thoại — hai nền tảng phải kêu giống nhau, nếu không thì
 * cùng một việc mà mỗi máy báo một kiểu.
 */
const OVERTONES: ReadonlyArray<{ ratio: number; amplitude: number; decayRate: number }> = [
  { ratio: 1.0, amplitude: 1.0, decayRate: 3.0 },
  { ratio: 2.0, amplitude: 0.55, decayRate: 4.2 },
  { ratio: 2.76, amplitude: 0.35, decayRate: 5.5 },
  { ratio: 3.87, amplitude: 0.22, decayRate: 7.0 },
  { ratio: 5.43, amplitude: 0.12, decayRate: 9.0 },
];

const BASE_FREQUENCY_HZ = 880;
/** To hơn bản cũ (0,12) một chút theo yêu cầu, vẫn đủ nhẹ để nghe cả buổi trực. */
const VOLUME = 0.22;
const RING_SECONDS = 1.1;

export function playNotificationSound() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    // Context bị treo khi tab chạy nền; đánh thức lại trước khi phát.
    if (ctx.state === "suspended") void ctx.resume();
    const startTime = ctx.currentTime;
    const totalAmplitude = OVERTONES.reduce((sum, overtone) => sum + overtone.amplitude, 0);

    for (const { ratio, amplitude, decayRate } of OVERTONES) {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = BASE_FREQUENCY_HZ * ratio;

      const peak = (VOLUME * amplitude) / totalAmplitude;
      // Vào trong 2 mili giây cho ra tiếng GÕ. Vào chậm hơn thì nghe như tiếng
      // sáo: cùng cao độ nhưng mất hẳn cảm giác có vật bị đánh vào.
      gain.gain.setValueAtTime(0.0001, startTime);
      gain.gain.exponentialRampToValueAtTime(peak, startTime + 0.002);
      // Tắt theo hàm mũ, mỗi bồi âm một tốc độ — bồi âm cao rụng trước, để lại
      // đuôi ngân ở nốt gốc.
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + Math.min(RING_SECONDS, 6 / decayRate));

      oscillator.connect(gain).connect(ctx.destination);
      oscillator.start(startTime);
      oscillator.stop(startTime + RING_SECONDS);
    }
  } catch {
    // Trình duyệt chặn phát tự động, hoặc thiết bị không có đầu ra âm thanh.
  }
}
