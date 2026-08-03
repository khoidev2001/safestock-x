/**
 * Cấu hình nền bản đồ dùng chung cho mọi bản đồ trong ứng dụng.
 *
 * Tách khỏi map-canvas.tsx để bản đồ trong tab nhiệm vụ không phải kéo cả component
 * bản đồ quản trị vào bundle chỉ vì cần mấy con số.
 */

// Zoom sâu nhất cho phép — đủ để thấy từng mái nhà và ngõ nhỏ.
export const MAX_DETAIL_ZOOM = 19;

// Gói tile offline chỉ có ảnh thật tới zoom 15. Đây là mức SÂU NHẤT CÓ ẢNH, không
// phải mức ngừng hiển thị: đặt vào maxZoom thì Leaflet ẩn hẳn lớp nền khi zoom quá
// 15 — đúng lúc người dùng phóng to để ghim thì bản đồ trắng trơn. Phải đặt vào
// maxNativeZoom để nó phóng to ô cuối cùng, mờ dần chứ không mất.
export const OFFLINE_MAX_NATIVE_ZOOM = 15;

// Thu nhỏ nhất là z9: tỉnh Đắk Lắk mới rộng 1.97°, khung bản đồ ~1030px chứa 2.83°
// ở z9 nhưng chỉ 1.41° ở z10 — nên z9 là mức đầu tiên thấy trọn tỉnh.
export const OFFLINE_PACK_MIN_ZOOM = 9;

// Gói tile có hai tầng nên vùng cho phép kéo cũng phải đổi theo zoom: nhìn xa thì
// được cả tỉnh, nhìn gần bó vào cụm 5 xã. Toạ độ lấy từ chính tên file tile.
export const PROVINCE_BOUNDS: [[number, number], [number, number]] = [
  [11.52, 106.88],
  [14.43, 110.04],
];
export const CLUSTER_BOUNDS: [[number, number], [number, number]] = [
  [13.23, 108.94],
  [13.62, 109.26],
];
export const CLUSTER_MIN_ZOOM = 12;

export const OFFLINE_TILE_URL = "/tiles/{z}/{x}/{y}.png";
// Gói tile tải sẵn từ CARTO voyager_nolabels — nền KHÔNG CHỮ. Tên địa danh nung
// vào ảnh tile thì không tắt được bằng code, mà bản đồ điều phối chỉ cần thấy kho
// và điểm sự cố. Ghi nguồn theo yêu cầu bản quyền của OSM và CARTO.
export const OFFLINE_TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>' +
  ' &copy; <a href="https://carto.com/attributions">CARTO</a> · offline cụm Đồng Xuân';

// Tile xám 1x1 (base64) cho ô ngoài vùng offline — thay vì ô vỡ.
export const BLANK_TILE =
  "data:image/gif;base64,R0lGODlhAQABAIAAAOfn5wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==";

// Fallback khi chưa có điểm nào: UBND xã Đồng Xuân — nơi đặt kho trung tâm. Không
// dùng tâm tỉnh, vì chỗ đó nằm ngoài vùng có tile nên bản đồ mở ra là nền trống.
export const DEFAULT_CENTER: [number, number] = [13.3782428, 109.104259];
