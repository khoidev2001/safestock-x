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

let boTron: AudioContext | null = null;

function layBoTron(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Constructor =
    window.AudioContext ??
    (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Constructor) return null;
  // Dùng lại một context duy nhất: mỗi lần `new AudioContext()` là một tài
  // nguyên âm thanh mới, mở vài chục cái trong một buổi trực là trình duyệt
  // ngừng cấp thêm và từ đó không còn tiếng nào nữa.
  if (!boTron) boTron = new Constructor();
  return boTron;
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
const BOI_AM: ReadonlyArray<{ tiLe: number; bienDo: number; tocDoTat: number }> = [
  { tiLe: 1.0, bienDo: 1.0, tocDoTat: 3.0 },
  { tiLe: 2.0, bienDo: 0.55, tocDoTat: 4.2 },
  { tiLe: 2.76, bienDo: 0.35, tocDoTat: 5.5 },
  { tiLe: 3.87, bienDo: 0.22, tocDoTat: 7.0 },
  { tiLe: 5.43, bienDo: 0.12, tocDoTat: 9.0 },
];

const TAN_SO_GOC = 880;
/** To hơn bản cũ (0,12) một chút theo yêu cầu, vẫn đủ nhẹ để nghe cả buổi trực. */
const DO_TO = 0.22;
const NGAN_GIAY = 1.1;

export function phatTiengThongBao() {
  try {
    const ctx = layBoTron();
    if (!ctx) return;
    // Context bị treo khi tab chạy nền; đánh thức lại trước khi phát.
    if (ctx.state === "suspended") void ctx.resume();
    const batDau = ctx.currentTime;
    const tongBienDo = BOI_AM.reduce((tong, boi) => tong + boi.bienDo, 0);

    for (const { tiLe, bienDo, tocDoTat } of BOI_AM) {
      const nguon = ctx.createOscillator();
      const cuongDo = ctx.createGain();
      nguon.type = "sine";
      nguon.frequency.value = TAN_SO_GOC * tiLe;

      const dinh = (DO_TO * bienDo) / tongBienDo;
      // Vào trong 2 mili giây cho ra tiếng GÕ. Vào chậm hơn thì nghe như tiếng
      // sáo: cùng cao độ nhưng mất hẳn cảm giác có vật bị đánh vào.
      cuongDo.gain.setValueAtTime(0.0001, batDau);
      cuongDo.gain.exponentialRampToValueAtTime(dinh, batDau + 0.002);
      // Tắt theo hàm mũ, mỗi bồi âm một tốc độ — bồi âm cao rụng trước, để lại
      // đuôi ngân ở nốt gốc.
      cuongDo.gain.exponentialRampToValueAtTime(0.0001, batDau + Math.min(NGAN_GIAY, 6 / tocDoTat));

      nguon.connect(cuongDo).connect(ctx.destination);
      nguon.start(batDau);
      nguon.stop(batDau + NGAN_GIAY);
    }
  } catch {
    // Trình duyệt chặn phát tự động, hoặc thiết bị không có đầu ra âm thanh.
  }
}
