/**
 * Mũi tên chỉ hướng đi rải dọc tuyến đường trên bản đồ.
 *
 * Một đường kẻ xanh nối kho với điểm nạn không nói được ĐI VỀ PHÍA NÀO. Với một
 * tuyến thì người xem tự suy ra từ hai đầu, nhưng bản đồ điều phối thường có bốn
 * năm tuyến chồng lên nhau ở đoạn gần điểm nạn — lúc đó không còn suy được nữa,
 * và người đi lấy hàng phải tự đoán mình đang nhìn chiều nào.
 *
 * Tính ở đây chứ không nhờ thư viện vẽ tuyến: web dựng bản đồ bằng react-leaflet
 * còn điện thoại nhúng một trang Leaflet trong WebView, hai đường hoàn toàn khác
 * nhau. Chung một hàm THUẦN thì mũi tên rơi vào đúng cùng những chỗ ở cả hai nơi,
 * và luật đặt mũi tên khoá được bằng test mà không cần dựng bản đồ nào.
 *
 * Toạ độ nhận vào theo thứ tự [vĩ độ, kinh độ] — đúng thứ tự Leaflet dùng, không
 * phải thứ tự GeoJSON. Bên gọi tự đảo trước khi truyền vào.
 */

/** Một điểm trên tuyến, theo thứ tự Leaflet: [vĩ độ, kinh độ]. */
export type RoutePoint = [number, number];

export interface RouteArrow {
  lat: number;
  lng: number;
  /**
   * Hướng đi tại điểm đó, tính bằng ĐỘ theo chiều kim đồng hồ từ hướng Bắc.
   *
   * Đúng quy ước của `transform: rotate()` trong CSS khi hình mũi tên được vẽ
   * chĩa lên trên: xoay `bearing` độ là nó chỉ đúng hướng đi.
   */
  bearing: number;
}

/**
 * Khoảng cách giữa hai mũi tên liên tiếp, tính bằng mét.
 *
 * Chọn theo cỡ màn hình điện thoại ở mức phóng thường dùng (z15–z17 cho một xã):
 * thưa hơn thì có tuyến ngắn không được mũi tên nào, dày hơn thì đoạn đường cong
 * biến thành một dãy mũi tên đè lên nhau thành vệt đặc.
 *
 * Để RỘNG hơn hẳn bản trước (320 m): mũi tên nay là một gạch thẳng có đầu nhọn
 * chứ không còn là hình tam giác nhỏ, nên nó chiếm dài gấp đôi trên màn hình. Giữ
 * nguyên khoảng cũ thì ở khúc cua các gạch nối đuôi nhau thành một vệt liền và
 * không còn đọc ra được đâu là mũi tên, đâu là tuyến.
 */
const ARROW_SPACING_METERS = 650;

/** Không rải quá số này trên MỘT tuyến — tuyến liên xã dài chục km sẽ đầy mũi tên. */
const MAX_ARROWS_PER_ROUTE = 8;

/**
 * Tuyến ngắn hơn ngần này thì KHÔNG vẽ mũi tên nào.
 *
 * Kho nằm ngay cạnh điểm nạn (kho thôn cấp cho chính thôn mình) cho ra một tuyến
 * vài chục mét, ở mức phóng thường thấy nó chỉ dài hơn cái mũi tên một chút. Vẽ
 * vào đó là che mất cả tuyến lẫn hai dấu ghim ở hai đầu.
 */
const MIN_ROUTE_LENGTH_METERS = 120;

const EARTH_RADIUS_M = 6_371_000;
const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;
const toDegrees = (radians: number): number => (radians * 180) / Math.PI;

/** Khoảng cách great-circle giữa hai điểm, mét. Cùng công thức với backend. */
function distanceMeters(from: RoutePoint, to: RoutePoint): number {
  const deltaLat = toRadians(to[0] - from[0]);
  const deltaLng = toRadians(to[1] - from[1]);
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(toRadians(from[0])) * Math.cos(toRadians(to[0])) * Math.sin(deltaLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Góc phương vị từ điểm này tới điểm kia, độ, 0 là hướng Bắc.
 *
 * Không dùng `atan2` trên hiệu toạ độ thô: ở vĩ độ 13° thì một độ kinh tuyến ngắn
 * hơn một độ vĩ tuyến khoảng 2,6%, nên góc tính thô lệch đi vài độ. Vài độ thì
 * mắt không bắt được trên một mũi tên, nhưng đủ để hai mũi tên trên cùng một đoạn
 * thẳng trông như hơi lệch nhau.
 */
function bearingDegrees(from: RoutePoint, to: RoutePoint): number {
  const fromLat = toRadians(from[0]);
  const toLat = toRadians(to[0]);
  const deltaLng = toRadians(to[1] - from[1]);
  const y = Math.sin(deltaLng) * Math.cos(toLat);
  const x =
    Math.cos(fromLat) * Math.sin(toLat) - Math.sin(fromLat) * Math.cos(toLat) * Math.cos(deltaLng);
  return (toDegrees(Math.atan2(y, x)) + 360) % 360;
}

/**
 * Rải mũi tên đều theo QUÃNG ĐƯỜNG dọc tuyến, không theo số điểm.
 *
 * Máy chủ định tuyến trả về điểm dày ở khúc cua và thưa ở đoạn thẳng dài. Rải
 * theo chỉ số mảng thì mũi tên chụm hết vào mấy khúc cua và cả đoạn thẳng dài
 * nhất tuyến không có cái nào — đúng chỗ người xem cần biết đang đi chiều nào.
 *
 * Hướng của mỗi mũi tên lấy từ đúng ĐOẠN nó đang nằm trên, nên ở khúc cua nó
 * quay theo cua thay vì chỉ thẳng tới đích.
 */
export function routeArrows(
  points: RoutePoint[],
  options?: { spacingMeters?: number; maxArrows?: number; minRouteLengthMeters?: number },
): RouteArrow[] {
  if (!Array.isArray(points) || points.length < 2) return [];
  const spacing = options?.spacingMeters ?? ARROW_SPACING_METERS;
  const maxArrows = options?.maxArrows ?? MAX_ARROWS_PER_ROUTE;
  const minLength = options?.minRouteLengthMeters ?? MIN_ROUTE_LENGTH_METERS;

  const segments: { from: RoutePoint; to: RoutePoint; length: number; startAt: number }[] = [];
  let total = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    const from = points[index];
    const to = points[index + 1];
    const length = distanceMeters(from, to);
    // Điểm trùng nhau (máy chủ định tuyến vẫn trả về) không có hướng nào để lấy.
    if (length <= 0) continue;
    segments.push({ from, to, length, startAt: total });
    total += length;
  }
  if (total < minLength || segments.length === 0) return [];

  /**
   * Số mũi tên: theo quãng đường, nhưng luôn có ÍT NHẤT MỘT.
   *
   * Tuyến dài 200 m không đủ một lần `spacing` nhưng vẫn cần chỉ hướng — nó chỉ
   * không đủ dài để cần hai cái.
   */
  const count = Math.max(1, Math.min(maxArrows, Math.floor(total / spacing)));
  const arrows: RouteArrow[] = [];
  for (let index = 0; index < count; index += 1) {
    // Đặt vào GIỮA mỗi khoảng chia, không phải ở mép: mũi tên ở mốc 0 nằm đè lên
    // dấu ghim kho, ở mốc cuối thì đè lên ghim điểm nạn.
    const along = (total * (index + 0.5)) / count;
    const segment =
      segments.find((item) => along >= item.startAt && along <= item.startAt + item.length) ??
      segments[segments.length - 1];
    const ratio = Math.min(1, Math.max(0, (along - segment.startAt) / segment.length));
    arrows.push({
      lat: segment.from[0] + (segment.to[0] - segment.from[0]) * ratio,
      lng: segment.from[1] + (segment.to[1] - segment.from[1]) * ratio,
      bearing: bearingDegrees(segment.from, segment.to),
    });
  }
  return arrows;
}

/**
 * Hình mũi tên đặt trên tuyến — MỘT nguồn cho cả web lẫn điện thoại.
 *
 * Là một GẠCH THẲNG có đầu nhọn, không phải một hình tam giác trơn. Tam giác nhỏ
 * nằm giữa tuyến đọc ra thành một dấu ghim hay một mảnh vụn của lớp bản đồ: nó
 * không có phần thân để mắt bắt được cái trục, nên muốn biết nó chỉ đâu thì phải
 * nhìn kỹ từng cái một. Gạch có thân thì hướng đọc được từ xa, và nó nằm gọn dọc
 * tim đường thay vì đè ngang qua.
 *
 * Vẽ hai lớp chồng nhau: lớp trắng dày bên dưới, lớp màu mảnh hơn bên trên. Tuyến
 * chạy trên ảnh vệ tinh nên một nét xanh trơn biến mất khi đi qua mái tôn sáng hay
 * mặt nước — đúng những chỗ khó nhìn nhất.
 *
 * Hình vẽ trong hệ toạ độ 24×24 và chĩa LÊN TRÊN, rồi cả khối xoay theo phương vị;
 * nhờ vậy `bearing` dùng thẳng được cho `rotate()` mà không phải quy đổi.
 */
export function routeArrowSvg(bearing: number, size = 16, color = "#1d4ed8"): string {
  // Thân chạy gần hết chiều cao khung, đầu nhọn mở 90° ở đỉnh. Vẽ liền một nét
  // (thân → cạnh trái đầu → đỉnh → cạnh phải đầu) để hai lớp luôn khớp nhau.
  //
  // Đuôi dừng ở 20.6 chứ không sát mép 24: nét vẽ có đầu bo tròn và lớp viền
  // trắng dày 6.4, nên nửa bề dày (3.2) còn thò ra quá đuôi. Chạm mép khung là bị
  // chính khung SVG cắt phẳng, và cái đuôi bo tròn biến thành một vết cắt ngang.
  const shaft = "M12 20.6 L12 5.4";
  const head = "M6.1 11 L12 4.2 L17.9 11";
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" ` +
    `style="transform: rotate(${bearing.toFixed(1)}deg); display: block;">` +
    `<path d="${shaft} ${head}" fill="none" stroke="#ffffff" stroke-width="6.4" ` +
    `stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="${shaft} ${head}" fill="none" stroke="${color}" stroke-width="3.4" ` +
    `stroke-linecap="round" stroke-linejoin="round"/>` +
    `</svg>`
  );
}
