/**
 * Thời gian dự kiến hàng tới điểm nạn, tính từ số liệu OSRM trả về.
 *
 * OSRM trả `duration` theo profile xe con chạy thông thoáng: nó lấy tốc độ theo
 * hạng đường trong bản đồ rồi chia. Con số đó dùng trực tiếp ra kết quả vô lý trên
 * màn hình điều phối — 0,7km "1 phút" (≈42km/h), 4,3km "5 phút" (≈52km/h). Không
 * xe tải cứu trợ nào chở đầy hàng chạy trung bình 50km/h trên đường liên thôn Đồng
 * Xuân, càng không phải giữa lúc đang ngập.
 *
 * Chính app này cũng đã tự nhận điều đó ở chỗ khác: `GeoService` khi phải lùi về
 * Haversine dùng `GEO_ASSUMED_SPEED_KMH` mặc định **30km/h**. Tức là cùng một hệ
 * thống nói 30km/h ở một đường và 50km/h ở đường kia — người điều phối đọc hai số
 * lệch nhau gần gấp đôi cho cùng một quãng đường.
 *
 * Mô hình ở đây:
 *
 * 1. **Trần tốc độ trung bình cả chuyến.** Lấy `min(tốc độ OSRM, trần)`. Giữ `min`
 *    chứ không thay thẳng bằng trần: khi tuyến toàn đường mòn và OSRM đã ước dưới
 *    trần thì con số của OSRM sát hơn — nó biết hạng đường, còn cái trần thì không.
 * 2. **Phụ phí mỗi chuyến.** Cộng một khoảng cố định cho phần không nằm trong quãng
 *    đường: lấy xe ra khỏi sân kho, quay đầu, và tiếp cận được đúng điểm giao ở
 *    hiện trường. Thiếu nó thì mọi cự ly ngắn đều ra "1 phút", mà 700m trong xã
 *    lúc mưa lụt không ai đi hết trong một phút.
 *
 * KHÔNG bao gồm thời gian soạn và bốc hàng: việc đó thuộc luồng yêu cầu kho
 * (`MissionWarehouseRequest`) và có mốc thời gian riêng, cộng vào đây là tính hai lần.
 *
 * Hai tham số đều đưa ra biến môi trường vì chúng là **giả định đã hiệu chỉnh, không
 * phải số đo**. Có biên bản diễn tập với thời gian chạy thật thì chỉnh lại tại chỗ,
 * không phải sửa code.
 */
export interface ReliefEtaAssumptions {
  /** Trần tốc độ trung bình cả chuyến, km/h. Phải > 0. */
  maxAverageSpeedKmh: number;
  /** Phút cộng cho mỗi chuyến: ra khỏi kho, quay đầu, tiếp cận điểm giao. */
  tripOverheadMinutes: number;
}

export const RELIEF_ETA_DEFAULTS: ReliefEtaAssumptions = {
  maxAverageSpeedKmh: 30,
  tripOverheadMinutes: 4,
};

/**
 * Đọc giả định từ cấu hình, có chốt an toàn.
 *
 * Cấu hình sai (chuỗi rỗng, chữ, số âm, 0) thì lùi về mặc định thay vì ném: đây
 * nằm trên đường xử lý một yêu cầu điều phối, làm sập nó để phản đối một biến môi
 * trường đánh máy sai là đổi một con số hơi lệch lấy cả màn hình trắng.
 */
export function reliefEtaAssumptions(read: (key: string) => unknown): ReliefEtaAssumptions {
  /**
   * `Number("")` ra 0, nên phải loại "chưa cấu hình" TRƯỚC khi parse. Bỏ bước này
   * thì biến môi trường bỏ trống biến thành phụ phí 0 phút một cách âm thầm —
   * đúng cái vô lý đang cần sửa, mà lại không có thông báo nào.
   */
  const parse = (value: unknown): number | null => {
    if (value == null) return null;
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    const text = String(value).trim();
    if (text === "") return null;
    const parsed = Number(text);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const positive = (value: unknown): number | null => {
    const parsed = parse(value);
    return parsed != null && parsed > 0 ? parsed : null;
  };
  const nonNegative = (value: unknown): number | null => {
    const parsed = parse(value);
    return parsed != null && parsed >= 0 ? parsed : null;
  };
  return {
    maxAverageSpeedKmh:
      positive(read("LOCAL_ROUTING_CONVOY_SPEED_KMH")) ??
      // Dùng chung giả định với đường Haversine của GeoService: hai đường cùng trả
      // ETA cho cùng một màn hình, lệch nhau là người dùng mất tin cả hai.
      positive(read("GEO_ASSUMED_SPEED_KMH")) ??
      RELIEF_ETA_DEFAULTS.maxAverageSpeedKmh,
    tripOverheadMinutes:
      nonNegative(read("LOCAL_ROUTING_TRIP_OVERHEAD_MIN")) ??
      RELIEF_ETA_DEFAULTS.tripOverheadMinutes,
  };
}

/**
 * @param distanceKm Quãng đường bộ OSRM đo được (km).
 * @param osrmDurationSeconds `duration` OSRM trả về; null nếu không có.
 */
export function reliefEtaMinutes(
  distanceKm: number | null,
  osrmDurationSeconds: number | null,
  assumptions: ReliefEtaAssumptions = RELIEF_ETA_DEFAULTS,
): number | null {
  if (distanceKm == null || !Number.isFinite(distanceKm) || distanceKm < 0) return null;

  const cap =
    Number.isFinite(assumptions.maxAverageSpeedKmh) && assumptions.maxAverageSpeedKmh > 0
      ? assumptions.maxAverageSpeedKmh
      : RELIEF_ETA_DEFAULTS.maxAverageSpeedKmh;
  const overhead =
    Number.isFinite(assumptions.tripOverheadMinutes) && assumptions.tripOverheadMinutes >= 0
      ? assumptions.tripOverheadMinutes
      : RELIEF_ETA_DEFAULTS.tripOverheadMinutes;

  // Kho nằm ngay tại điểm nạn (kho thôn của chính thôn đó): không có quãng đường,
  // nhưng vẫn phải ra xe và mang hàng tới chỗ giao.
  if (distanceKm === 0) return Math.max(1, Math.ceil(overhead));

  const osrmSpeedKmh =
    osrmDurationSeconds != null && Number.isFinite(osrmDurationSeconds) && osrmDurationSeconds > 0
      ? distanceKm / (osrmDurationSeconds / 3600)
      : null;
  const speedKmh = osrmSpeedKmh == null ? cap : Math.min(osrmSpeedKmh, cap);

  return Math.max(1, Math.ceil((distanceKm / speedKmh) * 60 + overhead));
}
