import sharp from "sharp";
import {
  MAX_DELIVERY_PHOTOS,
  MAX_DELIVERY_PHOTO_BYTES,
  OPTIMIZED_MAX_EDGE,
  decodeDeliveryPhotos,
  optimizeDeliveryPhoto,
} from "../delivery-photos";

const jpeg = (bytes = 32) =>
  Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(bytes, 7)]).toString("base64");
const png = () =>
  Buffer.concat([Buffer.from("89504e470d0a1a0a", "hex"), Buffer.alloc(16, 3)]).toString("base64");

describe("decodeDeliveryPhotos", () => {
  it("không gửi ảnh vẫn hợp lệ — ảnh là tuỳ chọn", () => {
    expect(decodeDeliveryPhotos(undefined)).toEqual({ ok: true, photos: [] });
    expect(decodeDeliveryPhotos([])).toEqual({ ok: true, photos: [] });
  });

  it("nhận cả base64 thuần lẫn data URL", () => {
    const result = decodeDeliveryPhotos([
      { dataBase64: jpeg() },
      { dataBase64: `data:image/png;base64,${png()}` },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.photos.map((photo) => photo.mimeType)).toEqual(["image/jpeg", "image/png"]);
    expect(result.photos[0].byteSize).toBe(35);
  });

  it("định dạng lấy từ byte đầu tệp, không lấy theo lời khai của máy khách", () => {
    // Khai là PNG nhưng ruột là JPEG: phải trả về image/jpeg, vì chính chuỗi này
    // sẽ thành Content-Type lúc trả ảnh ra cho trình duyệt người xem.
    const result = decodeDeliveryPhotos([{ dataBase64: `data:image/png;base64,${jpeg()}` }]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.photos[0].mimeType).toBe("image/jpeg");
  });

  it("từ chối thứ không phải ảnh", () => {
    const html = Buffer.from("<html><script>alert(1)</script>").toString("base64");
    const result = decodeDeliveryPhotos([{ dataBase64: `data:image/jpeg;base64,${html}` }]);
    expect(result).toEqual({
      ok: false,
      message: "Ảnh thứ 1 không phải ảnh JPG, PNG hay WEBP.",
    });
  });

  it("từ chối ảnh rỗng và ảnh quá nặng, nói rõ ảnh thứ mấy", () => {
    expect(decodeDeliveryPhotos([{ dataBase64: jpeg() }, { dataBase64: "   " }])).toEqual({
      ok: false,
      message: "Ảnh thứ 2 rỗng.",
    });
    const huge = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff]),
      Buffer.alloc(MAX_DELIVERY_PHOTO_BYTES, 1),
    ]).toString("base64");
    expect(decodeDeliveryPhotos([{ dataBase64: huge }])).toEqual({
      ok: false,
      message: "Ảnh thứ 1 nặng quá 5MB.",
    });
  });

  it("chặn khi vượt trần số ảnh", () => {
    const many = Array.from({ length: MAX_DELIVERY_PHOTOS + 1 }, () => ({ dataBase64: jpeg() }));
    expect(decodeDeliveryPhotos(many)).toEqual({
      ok: false,
      message: `Chỉ gửi kèm tối đa ${MAX_DELIVERY_PHOTOS} ảnh mỗi lần báo.`,
    });
  });
});

describe("optimizeDeliveryPhoto", () => {
  /** Ảnh giả lập cỡ máy điện thoại: nhiễu ngẫu nhiên để JPEG không nén được về vài byte. */
  async function phoneSizedPhoto(width: number, height: number) {
    const pixels = Buffer.alloc(width * height * 3);
    for (let i = 0; i < pixels.length; i += 1) pixels[i] = (i * 37) % 256;
    return sharp(pixels, { raw: { width, height, channels: 3 } })
      .jpeg({ quality: 100 })
      .toBuffer();
  }

  it("thu ảnh 12MP về cạnh dài 1600px và nhẹ đi nhiều lần", async () => {
    const original = await phoneSizedPhoto(4000, 3000);
    const result = await optimizeDeliveryPhoto({
      data: original,
      mimeType: "image/jpeg",
      byteSize: original.length,
    });

    const meta = await sharp(result.data).metadata();
    expect(meta.width).toBe(OPTIMIZED_MAX_EDGE);
    expect(meta.height).toBe(1200);
    expect(result.mimeType).toBe("image/jpeg");
    expect(result.byteSize).toBe(result.data.length);
    expect(result.byteSize).toBeLessThan(original.length / 4);
  }, 30_000);

  it("ảnh nhỏ hơn mức trần thì không bị phóng to", async () => {
    const original = await phoneSizedPhoto(800, 600);
    const result = await optimizeDeliveryPhoto({
      data: original,
      mimeType: "image/jpeg",
      byteSize: original.length,
    });
    const meta = await sharp(result.data).metadata();
    expect(meta.width).toBe(800);
    expect(meta.height).toBe(600);
  }, 30_000);

  it("xoá sạch EXIF — ảnh điện thoại nhúng sẵn toạ độ GPS và giờ chụp", async () => {
    const pixels = Buffer.alloc(64 * 64 * 3, 120);
    const coExif = await sharp(pixels, { raw: { width: 64, height: 64, channels: 3 } })
      .withExif({ IFD0: { Copyright: "hien-truong", Software: "camera" } })
      .jpeg()
      .toBuffer();
    expect((await sharp(coExif).metadata()).exif).toBeDefined();

    const result = await optimizeDeliveryPhoto({
      data: coExif,
      mimeType: "image/jpeg",
      byteSize: coExif.length,
    });
    expect((await sharp(result.data).metadata()).exif).toBeUndefined();
  }, 30_000);

  it("PNG cũng ra JPEG — kho ảnh chỉ giữ một định dạng", async () => {
    const png = await sharp(Buffer.alloc(32 * 32 * 3, 200), {
      raw: { width: 32, height: 32, channels: 3 },
    })
      .png()
      .toBuffer();
    const result = await optimizeDeliveryPhoto({
      data: png,
      mimeType: "image/png",
      byteSize: png.length,
    });
    expect(result.mimeType).toBe("image/jpeg");
    expect((await sharp(result.data).metadata()).format).toBe("jpeg");
  }, 30_000);
});
