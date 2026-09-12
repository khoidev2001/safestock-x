/**
 * Chọn ảnh từ máy rồi ép về một data URI đủ nhỏ để cất thẳng vào cột `avatarUrl`.
 *
 * VÌ SAO PHẢI ÉP: ảnh chụp bằng máy này là 12 megapixel, mã hoá base64 ra khoảng
 * bốn triệu ký tự. Cột `avatarUrl` chặn ở 80.000 — gửi thẳng lên là máy chủ trả
 * 400 và người dùng chỉ thấy "cập nhật thất bại" mà không hiểu vì sao. Ảnh đại
 * diện hiển thị to nhất cỡ 96 điểm, nên 256×256 là đã dư.
 *
 * Cách làm chép ĐÚNG theo bản web (`profile-avatar-editor.tsx`): cắt vuông, thu
 * về 256×256, rồi hạ chất lượng theo từng nấc cho tới khi lọt trần. Hai nơi phải
 * ra cùng một cỡ ảnh, nếu không thì cùng một người đổi ảnh trên web và trên điện
 * thoại lại cho hai kết quả khác nhau.
 *
 * Khác một điểm: web dùng WebP, ở đây dùng JPEG. `expo-image-manipulator` trên
 * Android không nhận WebP, mà JPEG ở 256×256 vẫn thừa sức lọt trần.
 */
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";

/** Giới hạn của cột `avatarUrl` phía máy chủ. Đổi ở đây là phải đổi cả hai nơi. */
const MAX_AVATAR_DATA_URL_LENGTH = 80_000;

/** Cạnh ảnh sau khi thu nhỏ, tính bằng điểm ảnh. */
const AVATAR_EDGE_PIXELS = 256;

/**
 * Các nấc chất lượng thử lần lượt từ cao xuống thấp.
 *
 * Bắt đầu ở 0.82 chứ không phải 1.0: ảnh 256×256 nén ở mức 1.0 gần như không đẹp
 * hơn 0.82 mà nặng gấp đôi. Nấc cuối 0.4 là ngưỡng còn nhìn được mặt người.
 */
const QUALITY_STEPS = [0.82, 0.72, 0.62, 0.52, 0.4];

export type AvatarPickResult =
  | { kind: "picked"; dataUrl: string }
  | { kind: "cancelled" }
  | { kind: "denied" }
  | { kind: "too-large" };

/**
 * Mở thư viện ảnh, để người dùng cắt vuông, rồi trả về data URI đã thu nhỏ.
 *
 * Trả về một kiểu có nhãn thay vì ném lỗi: bị từ chối quyền và bấm huỷ đều là
 * chuyện bình thường, không phải sự cố — màn hình gọi hàm này cần phân biệt để
 * nói đúng câu, chứ không hiện "có lỗi xảy ra" cho cả ba trường hợp.
 */
export async function pickAvatarImage(): Promise<AvatarPickResult> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return { kind: "denied" };

  const picked = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    // Cho cắt ngay trong trình chọn: khung hiển thị là hình tròn, nên ảnh không
    // vuông sẽ bị cắt mất hai đầu. Để người dùng tự chọn cắt phần nào còn hơn để
    // máy cắt giữa rồi mất nửa khuôn mặt.
    allowsEditing: true,
    aspect: [1, 1],
    quality: 1,
  });
  if (picked.canceled || !picked.assets?.[0]) return { kind: "cancelled" };

  return compressToDataUrl(picked.assets[0].uri);
}

/**
 * Thu ảnh về 256×256 rồi hạ chất lượng dần cho tới khi lọt trần.
 *
 * Đo bằng ĐỘ DÀI CHUỖI chứ không ước lượng theo dung lượng tệp: cột phía máy chủ
 * chặn theo số ký tự của data URI, mà base64 nở thêm một phần ba so với dữ liệu
 * gốc. Ước lượng sai một nhịp là người dùng nhận lỗi 400.
 */
async function compressToDataUrl(uri: string): Promise<AvatarPickResult> {
  for (const quality of QUALITY_STEPS) {
    const output = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: AVATAR_EDGE_PIXELS, height: AVATAR_EDGE_PIXELS } }],
      { compress: quality, format: ImageManipulator.SaveFormat.JPEG, base64: true },
    );
    if (!output.base64) continue;
    const dataUrl = `data:image/jpeg;base64,${output.base64}`;
    if (dataUrl.length <= MAX_AVATAR_DATA_URL_LENGTH) return { kind: "picked", dataUrl };
  }
  // Hạ hết nấc mà vẫn quá nặng: thà nói thẳng còn hơn gửi lên để máy chủ từ chối
  // bằng một câu kỹ thuật.
  return { kind: "too-large" };
}
