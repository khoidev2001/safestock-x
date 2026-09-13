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
 * Mũi tên ĐẶC, nền trắng, nằm LỌT LÒNG trong nét màu của tuyến.
 *
 * Bản trước vẽ bằng nét kẻ: một gạch có đầu nhọn, thân màu 3.4 kèm quầng trắng
 * 6.4, khung 26px. Quy ra màn hình thì đầu nhọn rộng 12,8px và quầng trắng 6,9px,
 * trong khi thân tuyến chỉ dày 7px — mũi tên tràn ra hai bên đường và cái quầng
 * trắng biến nó thành một cục rời, đọc ra như dấu ghim rơi trên tuyến chứ không
 * như chiều đi của chính tuyến ấy.
 *
 * Nay: hình đặc tô trắng, bề ngang 9 đơn vị trên khung 24, cộng viền 1 đơn vị là
 * 10 — ở cỡ khung 16px thành 6,7px, vừa lọt trong nét 7px và còn chừa mỗi bên một
 * vệt màu. Viền lấy chính màu tuyến nên ở chỗ mũi tên đè lên mép trắng của tuyến
 * nó vẫn tách ra được.
 *
 * Dài 20 đơn vị (13,3px) — dài hơn rộng gấp đôi, để hướng đọc được từ xa mà không
 * phải nới bề ngang.
 *
 * Hình vẽ trong hệ toạ độ 24×24 và chĩa LÊN TRÊN, rồi cả khối xoay theo phương vị;
 * nhờ vậy `bearing` dùng thẳng được cho `rotate()` mà không phải quy đổi.
 */
export function routeArrowSvg(bearing: number, size = 16, color = "#1d4ed8"): string {
  // Đỉnh → cạnh phải đầu → vai phải → đuôi phải → đuôi trái → vai trái → cạnh trái đầu.
  // Một đa giác khép kín, không phải nét kẻ: nét kẻ có bề dày riêng cộng thêm vào
  // bề ngang, mà bề ngang mới là thứ phải giữ dưới 7px.
  const arrow = "12 2 16.5 10 13.9 10 13.9 22 10.1 22 10.1 10 7.5 10";
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" ` +
    `style="transform: rotate(${bearing.toFixed(1)}deg); display: block;">` +
    `<polygon points="${arrow}" fill="#ffffff" stroke="${color}" stroke-width="1" ` +
    `stroke-linejoin="round"/>` +
    `</svg>`
  );
}

