/**
 * Ảnh bằng chứng đội hiện trường gửi kèm lúc báo hoàn thành nhiệm vụ.
 *
 * Người đi giao chụp ngay tại điểm nạn rồi gửi cùng lời báo kết quả. Vật tư đã
 * trừ khỏi kho từ lúc xuất, nên "đã giao xong" mà không có gì kèm theo thì về
 * sau không ai dựng lại được là hàng đã tới tay ai. Một tấm ảnh chụp tại chỗ là
 * thứ rẻ nhất mà người ở nhà kiểm chứng được.
 *
 * Ảnh KHÔNG BẮT BUỘC: mưa lũ, điện thoại sắp hết pin, sóng yếu — bắt buộc chụp
 * thì người ta sẽ bấm bừa một tấm tối đen cho xong, và dữ liệu đó còn tệ hơn là
 * không có.
 */
import sharp from "sharp";

/** Trần số ảnh mỗi lần báo. Nhiều hơn thế là ghi hình hiện trường, không phải bằng chứng giao hàng. */
export const MAX_DELIVERY_PHOTOS = 6;

/** Trần dung lượng MỖI ảnh sau khi giải mã. Ảnh JPEG điện thoại nén sẵn hiếm khi vượt. */
export const MAX_DELIVERY_PHOTO_BYTES = 5 * 1024 * 1024;

export interface DeliveryPhotoInput {
  /** Base64 thuần hoặc data URL (`data:image/jpeg;base64,...`). */
  dataBase64: string;
}

export interface DecodedDeliveryPhoto {
  data: Buffer;
  mimeType: string;
  byteSize: number;
}

export type DecodeResult =
  { ok: true; photos: DecodedDeliveryPhoto[] } | { ok: false; message: string };

/**
 * Nhận diện định dạng bằng CHÍNH BYTE ĐẦU TỆP, không tin phần `data:image/...`
 * do máy khách khai.
 *
 * Phần khai đó do bên gửi tự viết, nên nó nói được bất cứ điều gì. Ảnh lưu trong
 * cơ sở dữ liệu rồi sẽ được trả ra kèm đúng `Content-Type` đó; tin lời khai là
 * mở đường cho một tệp HTML tự xưng là ảnh chạy trong trình duyệt người xem.
 */
function sniffImageMime(data: Buffer): string | null {
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
    return "image/jpeg";
  }
  if (data.length >= 8 && data.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))) {
    return "image/png";
  }
  if (
    data.length >= 12 &&
    data.subarray(0, 4).toString("ascii") === "RIFF" &&
    data.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

/** Bỏ phần đầu `data:...;base64,` nếu có; máy khách gửi kiểu nào cũng nhận. */
function stripDataUrlPrefix(raw: string): string {
  const comma = raw.indexOf(",");
  return raw.startsWith("data:") && comma > 0 ? raw.slice(comma + 1) : raw;
}

/**
 * Giải mã và kiểm tra loạt ảnh gửi lên.
 *
 * Trả kết quả thay vì ném lỗi: tầng này không biết gì về HTTP, còn câu chữ báo
 * lỗi thì phải đọc được trên điện thoại của người đang đứng ngoài hiện trường.
 */
export function decodeDeliveryPhotos(inputs: DeliveryPhotoInput[] | undefined): DecodeResult {
  if (!inputs || inputs.length === 0) return { ok: true, photos: [] };
  if (inputs.length > MAX_DELIVERY_PHOTOS) {
    return { ok: false, message: `Chỉ gửi kèm tối đa ${MAX_DELIVERY_PHOTOS} ảnh mỗi lần báo.` };
  }

  const photos: DecodedDeliveryPhoto[] = [];
  for (const [index, input] of inputs.entries()) {
    const payload = stripDataUrlPrefix(input.dataBase64 ?? "").trim();
    if (payload.length === 0) {
      return { ok: false, message: `Ảnh thứ ${index + 1} rỗng.` };
    }
    const data = Buffer.from(payload, "base64");
    // Base64 hỏng không làm `Buffer.from` ném lỗi — nó lặng lẽ bỏ ký tự lạ và
    // trả về phần đọc được. Nên phải tự kiểm: rỗng, hoặc byte đầu không ra định
    // dạng ảnh nào, nghĩa là thứ gửi lên không phải ảnh.
    if (data.length === 0) {
      return { ok: false, message: `Ảnh thứ ${index + 1} không đọc được.` };
    }
    if (data.length > MAX_DELIVERY_PHOTO_BYTES) {
      const mb = Math.round((MAX_DELIVERY_PHOTO_BYTES / (1024 * 1024)) * 10) / 10;
      return { ok: false, message: `Ảnh thứ ${index + 1} nặng quá ${mb}MB.` };
    }
    const mimeType = sniffImageMime(data);
    if (!mimeType) {
      return { ok: false, message: `Ảnh thứ ${index + 1} không phải ảnh JPG, PNG hay WEBP.` };
    }
    photos.push({ data, mimeType, byteSize: data.length });
  }
  return { ok: true, photos };
}

/** Cạnh dài nhất sau khi nén. Đủ đọc chữ trên thùng hàng, không hơn. */
export const OPTIMIZED_MAX_EDGE = 1600;

/** Chất lượng JPEG sau khi nén — mức thấy rõ vật thể, không thấy vệt nén. */
export const OPTIMIZED_JPEG_QUALITY = 72;

/**
 * Nén ảnh trước khi lưu: thu nhỏ về cạnh dài 1600px, xuất JPEG, bỏ sạch metadata.
 *
 * Ảnh gốc từ điện thoại là 12MP, nặng 2–4MB, trong khi thứ người điều phối cần
 * nhìn chỉ là "hàng gì, ở đâu, ai nhận" — 1600px thừa sức. Nén một lần lúc nhận
 * rẻ hơn nhiều so với trả tấm 4MB đó lại cho MỌI lượt xem về sau.
 *
 * Bỏ metadata không chỉ để nhẹ: ảnh điện thoại mặc định nhúng TOẠ ĐỘ GPS và giờ
 * chụp. Ứng dụng này có luật rõ là không thu vị trí liên tục của người đi hiện
 * trường, nên để EXIF lọt vào kho ảnh là thu chính thứ đã hứa không thu.
 *
 * Xoay theo EXIF TRƯỚC khi xoá nó: bỏ thẳng thẻ Orientation sẽ làm ảnh chụp dọc
 * hiện ra nằm ngang.
 */
export async function optimizeDeliveryPhoto(
  photo: DecodedDeliveryPhoto,
): Promise<DecodedDeliveryPhoto> {
  const data = await sharp(photo.data)
    .rotate()
    .resize({
      width: OPTIMIZED_MAX_EDGE,
      height: OPTIMIZED_MAX_EDGE,
      fit: "inside",
      // Ảnh nhỏ hơn mức trần thì giữ nguyên: phóng to lên chỉ tốn byte mà không
      // thêm một chi tiết nào.
      withoutEnlargement: true,
    })
    .jpeg({ quality: OPTIMIZED_JPEG_QUALITY, mozjpeg: true })
    .toBuffer();
  return { data, mimeType: "image/jpeg", byteSize: data.length };
}
