/**
 * Haversine — khoảng cách đường chim bay giữa 2 toạ độ (km).
 * Pure function, không phụ thuộc mạng/DB → chạy offline, luôn có kết quả.
 * Dùng làm nền + fallback khi Google Routes không sẵn (mất mạng / vượt quota).
 */

export interface LatLng {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_KM = 6371;

const toRad = (deg: number): number => (deg * Math.PI) / 180;

/** Khoảng cách chim bay giữa 2 điểm, đơn vị km. */
export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/**
 * Ước lượng thời gian di chuyển (phút) từ khoảng cách + tốc độ giả định.
 * Đường bộ thực tế dài hơn chim bay → nhân hệ số vòng vèo (detour factor).
 */
export function estimateEtaMinutes(
  km: number,
  assumedSpeedKmh: number,
  detourFactor = 1.3,
): number {
  if (assumedSpeedKmh <= 0) throw new Error("assumedSpeedKmh phải > 0");
  const roadKm = km * detourFactor;
  return Math.round((roadKm / assumedSpeedKmh) * 60);
}
