/**
 * Ô báo kết quả ở cuối màn chi tiết nhiệm vụ, phía lực lượng hiện trường.
 *
 * Người đi giao về tới nơi thì việc còn lại là ĐÓNG nhiệm vụ: kể lại kết quả nếu
 * có gì đáng kể, chụp vài tấm làm bằng chứng nếu chụp được, rồi xác nhận đã hoàn
 * thành. Cả lời kể lẫn ảnh đều KHÔNG bắt buộc — bắt buộc thì người đang ướt, hết
 * pin, sóng chập chờn sẽ gõ bừa cho qua, và dòng chữ bừa đó còn tệ hơn ô trống.
 *
 * Tách khỏi màn hình để chạy được test: quy tắc "gửi được hay chưa" và "đủ ảnh
 * chưa" là nghiệp vụ, không phải chuyện vẽ nút.
 */

/** Trần số ảnh mỗi lần báo — khớp trần của máy chủ, để chặn ngay trên máy. */
export const MAX_EVIDENCE_PHOTOS = 6;

/** Trần dung lượng mỗi ảnh, khớp `MAX_DELIVERY_PHOTO_BYTES` của máy chủ. */
export const MAX_EVIDENCE_PHOTO_BYTES = 5 * 1024 * 1024;

export interface EvidencePhoto {
  id: string;
  /** Base64 thuần của ảnh JPEG máy ảnh trả về. */
  dataBase64: string;
}

/**
 * Số byte thật của một chuỗi base64.
 *
 * Cần con số này để chặn ảnh quá nặng TRƯỚC khi gửi: người ở hiện trường thường
 * chỉ có sóng 3G, gửi 5MB lên rồi nhận về câu từ chối là mất vài phút và một
 * phần pin cho đúng một thông báo lỗi.
 */
export function base64ByteSize(dataBase64: string): number {
  const clean = dataBase64.replace(/^data:[^,]*,/, "").replace(/\s/g, "");
  if (clean.length === 0) return 0;
  const padding = clean.endsWith("==") ? 2 : clean.endsWith("=") ? 1 : 0;
  return Math.floor((clean.length * 3) / 4) - padding;
}

export type AddPhotoResult = { photos: EvidencePhoto[]; error?: string };

/** Thêm một ảnh vừa chụp; quá trần hoặc ảnh lỗi thì giữ nguyên danh sách và nói lý do. */
export function addEvidencePhoto(photos: EvidencePhoto[], photo: EvidencePhoto): AddPhotoResult {
  if (photos.length >= MAX_EVIDENCE_PHOTOS) {
    return { photos, error: `Mỗi lần báo kèm tối đa ${MAX_EVIDENCE_PHOTOS} ảnh.` };
  }
  const bytes = base64ByteSize(photo.dataBase64);
  if (bytes === 0) return { photos, error: "Ảnh chụp bị lỗi, hãy chụp lại." };
  if (bytes > MAX_EVIDENCE_PHOTO_BYTES) {
    return { photos, error: "Ảnh nặng quá 5MB, hãy chụp lại." };
  }
  return { photos: [...photos, photo] };
}

export function removeEvidencePhoto(photos: EvidencePhoto[], id: string): EvidencePhoto[] {
  return photos.filter((photo) => photo.id !== id);
}

/**
 * Câu nhắc ngay trên nút xác nhận: bấm xong thì thứ gì được gửi đi.
 *
 * Ô trống là hợp lệ, nhưng người bấm phải BIẾT mình đang gửi một bản báo trống
 * chứ không phải tưởng lời vừa gõ đã vào. Đây là nút đóng nhiệm vụ, không bấm
 * lại được.
 */
export function deliveryReportSummary(note: string, photoCount: number): string {
  const hasNote = note.trim().length > 0;
  if (hasNote && photoCount > 0) return `Gửi kèm kết quả và ${photoCount} ảnh bằng chứng.`;
  if (hasNote) return "Gửi kèm kết quả bằng chữ, không có ảnh.";
  if (photoCount > 0) return `Gửi kèm ${photoCount} ảnh bằng chứng, không có ghi chú.`;
  return "Chưa nhập kết quả và chưa có ảnh — vẫn xác nhận hoàn thành được.";
}

/** Cạnh dài tối thiểu cần giữ khi chọn cỡ chụp — khớp mức nén của máy chủ. */
export const TARGET_CAPTURE_EDGE = 1600;

/**
 * Chọn cỡ ảnh cho máy ảnh trong danh sách cỡ mà máy hỗ trợ.
 *
 * Mặc định máy ảnh chụp hết cỡ cảm biến — 12MP, tệp 2–4MB. Máy chủ dù sao cũng
 * nén về cạnh 1600px, nên chụp to hơn thế chỉ tốn đúng một thứ: sóng của người
 * đang đứng giữa vùng vừa có thiên tai, nơi 3G chập chờn là chuyện thường.
 *
 * Chọn cỡ NHỎ NHẤT mà cạnh dài vẫn từ 1600px trở lên: nhỏ hơn nữa thì máy chủ
 * không có gì để nén, ảnh mờ đi thật sự. Không cỡ nào đạt (hoặc máy trả về tên
 * preset như "Photo", "High" của iOS) thì trả về undefined để giữ mặc định của
 * máy — thà nặng còn hơn ép một cỡ lạ rồi ảnh méo tỉ lệ.
 */
export function pickCaptureSize(sizes: string[]): string | undefined {
  const parsed = sizes
    .map((size) => {
      const match = /^(\d+)\s*[x×]\s*(\d+)$/i.exec(size.trim());
      if (!match) return null;
      const width = Number(match[1]);
      const height = Number(match[2]);
      return { size, longEdge: Math.max(width, height), pixels: width * height };
    })
    .filter((entry): entry is { size: string; longEdge: number; pixels: number } => entry !== null)
    .filter((entry) => entry.longEdge >= TARGET_CAPTURE_EDGE)
    .sort((left, right) => left.pixels - right.pixels);
  return parsed[0]?.size;
}
