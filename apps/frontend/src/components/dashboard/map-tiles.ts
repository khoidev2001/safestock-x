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

/**
 * Nền vệ tinh — CHẾ ĐỘ TÙY CHỌN, CẦN INTERNET.
 *
 * Gói tile offline là nền vẽ (voyager_nolabels), tới zoom 15 và không có chữ: đủ
 * để thấy kho nằm đâu, nhưng ghim đúng một căn nhà hay một khúc đường thì thưa
 * quá — không có mái nhà, không có bờ ruộng, không có tên chỗ nào.
 *
 * Ảnh vệ tinh Esri World Imagery đi tới zoom 19 và là ảnh thật, nên ghim theo mái
 * nhà/ngã ba được. Đánh đổi: nó tải từ Internet, nên MẤT MẠNG LÀ TRẮNG NỀN. Vì thế
 * đây là chế độ người dùng tự bật, mặc định vẫn là gói offline — cam kết "chạy khi
 * mất mạng" của hệ thống không được phụ thuộc vào nó.
 */
export const SATELLITE_TILE_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
/**
 * Zoom SÂU NHẤT CÓ ẢNH THẬT của Esri ở vùng Đồng Xuân — đo trực tiếp, không phỏng đoán.
 *
 * Esri công bố World Imagery tới zoom 19, nhưng đó là mức toàn cầu ở nơi có ảnh độ
 * phân giải cao. Vùng nông thôn Phú Yên chỉ có ảnh tới **z18**. Từ z19 trở lên máy
 * chủ KHÔNG trả 404 — nó trả HTTP 200 kèm một ảnh xám in chữ "Map data not yet
 * available". Leaflet coi đó là tile hợp lệ nên `errorTileUrl` không cứu được: nó
 * dán thẳng chữ đó lên khắp bản đồ đúng lúc người dùng phóng to hết để ghim.
 *
 * Đo bằng cách lấy cùng một zoom ở hai chỗ cách xa nhau trong xã (Long Châu và
 * Triêm Đức) rồi so md5:
 *
 *   z15  18.5KB / 18.1KB  md5 khác nhau  → ảnh thật
 *   z16  21.2KB / 20.7KB  md5 khác nhau  → ảnh thật
 *   z17  20.4KB / 17.5KB  md5 khác nhau  → ảnh thật
 *   z18  14.5KB / 11.3KB  md5 khác nhau  → ảnh thật
 *   z19   2.5KB /  2.5KB  md5 GIỐNG NHAU → ảnh giữ chỗ
 *   z20   2.5KB /  2.5KB  md5 GIỐNG NHAU → ảnh giữ chỗ
 *
 * Đặt 18 vào `maxNativeZoom` (không phải `maxZoom`) thì Leaflet phóng to ô z18 khi
 * người dùng zoom sâu hơn: mờ dần nhưng vẫn là ảnh thật của đúng chỗ đó, vẫn ghim
 * được. Cùng lý do với `OFFLINE_MAX_NATIVE_ZOOM` ở trên.
 */
export const SATELLITE_MAX_NATIVE_ZOOM = 18;
export const SATELLITE_TILE_ATTRIBUTION =
  'Ảnh vệ tinh &copy; <a href="https://www.esri.com/">Esri</a>, Maxar, Earthstar Geographics ·' +
  " cần Internet";

/**
 * Lớp chữ phủ lên ảnh vệ tinh: tên thôn, tên đường, địa điểm.
 *
 * Ảnh vệ tinh trần không có chữ nào — nhìn ra mái nhà nhưng không biết đó là thôn
 * nào, nên vẫn khó đối chiếu với lời kể qua điện thoại ("nhà văn hoá thôn Long
 * Châu"). Lớp này trong suốt, chỉ có chữ và nét đường, phủ lên trên.
 */
export const SATELLITE_LABELS_TILE_URL =
  "https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png";

// Tile xám 1x1 (base64) cho ô ngoài vùng offline — thay vì ô vỡ.
export const BLANK_TILE =
  "data:image/gif;base64,R0lGODlhAQABAIAAAOfn5wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==";

// Fallback khi chưa có điểm nào: UBND xã Đồng Xuân — nơi đặt kho trung tâm. Không
// dùng tâm tỉnh, vì chỗ đó nằm ngoài vùng có tile nên bản đồ mở ra là nền trống.
export const DEFAULT_CENTER: [number, number] = [13.3782428, 109.104259];
