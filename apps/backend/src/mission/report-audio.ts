/**
 * Bản ghi âm trưởng thôn gửi kèm báo cáo tình huống.
 *
 * Khác hẳn đường `transcribe`: đường kia đổi giọng nói thành chữ rồi VỨT file
 * đi. Chữ nhận dạng ra có thể sai tên thôn, sai số người — đúng hai thứ quyết
 * định điều bao nhiêu xe đi đâu, mà người điều phối lại không có cách nào biết
 * nó sai. Giữ lại file để họ nghe thẳng lời người báo rồi tự điền.
 *
 * KHÔNG BẮT BUỘC. Mưa lũ, sóng yếu, điện thoại sắp hết pin — bắt buộc ghi âm
 * thì người ta bấm bừa một đoạn im lặng cho xong, còn tệ hơn là không có.
 */

/**
 * Trần dung lượng SAU khi giải mã.
 *
 * Một phút WAV PCM 16kHz mono 16-bit là 1,92MB; 9MB đủ chỗ cho cả định dạng nén
 * kém lẫn chút dư. Quá mức này thì đây không còn là lời kể hiện trường nữa.
 */
export const MAX_REPORT_AUDIO_BYTES = 9 * 1024 * 1024;

export interface DecodedReportAudio {
  buffer: Buffer;
  mimeType: string;
}

/**
 * Nhận diện định dạng bằng CHÍNH BYTE ĐẦU TỆP, không tin lời khai của máy khách.
 *
 * Lời khai do bên gửi tự viết nên nó nói được bất cứ điều gì, mà file lưu xong
 * sẽ được trả ra kèm đúng `Content-Type` ấy — tin lời khai là mở đường cho một
 * tệp HTML tự xưng là âm thanh chạy trong trình duyệt người nghe.
 *
 * Chỉ nhận ba định dạng mà chính app này ghi ra: WAV (Android native), WebM và
 * MP4/M4A (trình duyệt). Định dạng lạ thì từ chối chứ không đoán.
 */
function sniffAudioMime(data: Buffer): string | null {
  if (
    data.length >= 12 &&
    data.subarray(0, 4).toString("ascii") === "RIFF" &&
    data.subarray(8, 12).toString("ascii") === "WAVE"
  ) {
    return "audio/wav";
  }
  // WebM/Matroska: bốn byte EBML mở đầu.
  if (data.length >= 4 && data.subarray(0, 4).equals(Buffer.from("1a45dfa3", "hex"))) {
    return "audio/webm";
  }
  // MP4/M4A: hộp `ftyp` nằm ngay sau bốn byte độ dài.
  if (data.length >= 12 && data.subarray(4, 8).toString("ascii") === "ftyp") {
    return "audio/mp4";
  }
  return null;
}

/** Bỏ phần đầu `data:...;base64,` nếu có; máy khách gửi kiểu nào cũng nhận. */
function stripDataUrlPrefix(value: string): string {
  const comma = value.indexOf(",");
  return value.startsWith("data:") && comma > -1 ? value.slice(comma + 1) : value;
}

export type DecodeReportAudioResult =
  | { ok: true; audio: DecodedReportAudio | null }
  | { ok: false; message: string };

/**
 * Giải mã bản ghi âm kèm theo báo cáo. Không có ghi âm là chuyện bình thường,
 * nên trả `audio: null` chứ không phải lỗi.
 */
export function decodeReportAudio(
  input: { base64: string; durationMs?: number } | undefined,
): DecodeReportAudioResult {
  const raw = input?.base64?.trim();
  if (!raw) return { ok: true, audio: null };

  let buffer: Buffer;
  try {
    buffer = Buffer.from(stripDataUrlPrefix(raw), "base64");
  } catch {
    return { ok: false, message: "Bản ghi âm không đọc được." };
  }
  if (buffer.length === 0) return { ok: false, message: "Bản ghi âm rỗng." };
  if (buffer.length > MAX_REPORT_AUDIO_BYTES) {
    return { ok: false, message: "Bản ghi âm quá dài. Vui lòng ghi ngắn lại rồi gửi." };
  }

  const mimeType = sniffAudioMime(buffer);
  if (!mimeType) {
    return { ok: false, message: "Định dạng ghi âm không được hỗ trợ." };
  }
  return { ok: true, audio: { buffer, mimeType } };
}
