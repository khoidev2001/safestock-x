import L from "leaflet";
import { houseSvg, sosPinSvg, villaSvg } from "@safestock/shared-types";

/**
 * Hình vẽ cho các điểm trên bản đồ — MỘT nguồn cho cả bản đồ kho, bản đồ điều
 * phối cứu hộ lẫn phần chú giải dưới bản đồ.
 *
 * Mỗi hình có hai cách dùng, chung một thân SVG:
 *   - `*Svg()`  → chuỗi SVG để chú giải vẽ đúng hình đang thấy trên bản đồ. Chú
 *                 giải bằng chấm tròn màu bắt người xem tự đoán chấm nào ứng với
 *                 hình nào; vẽ thẳng ngôi nhà ra thì khỏi phải đoán.
 *   - `*Icon()` → `L.DivIcon` để Leaflet đặt lên bản đồ.
 *
 * Ba hình, ba vai:
 *   - Nhà thường  → kho thôn
 *   - Nhà lớn     → kho tổng xã, to hơn và có nhiều cửa sổ, nhìn là biết đây là
 *                   nơi trữ chính chứ không phải một kho lẻ
 *   - Ghim SOS    → điểm gặp nạn
 *
 * MÀU nói kho đó có đang góp hàng cho phương án hay không, KHÔNG nói kho tổng hay
 * kho thôn (hình dáng đã nói điều đó rồi): xám = chưa huy động, xanh = đang tiếp
 * tế. Trước đây kho tổng luôn xanh nên trên bản đồ điều phối nó trông y hệt một
 * kho đã được chọn cấp hàng, dù phương án chưa hề đụng tới.
 *
 * Chân nhà/mũi ghim đặt đúng vào toạ độ (`iconAnchor` ở đáy) để hình "đứng" trên
 * vị trí thật, không lơ lửng lệch lên trên như khi neo vào tâm.
 */

/** Kho đã được chọn cấp hàng cho phương án đang xem. */
export const MAP_SUPPLYING_COLOR = "var(--color-accent, #2f9e6e)";
/** Kho có mặt trên bản đồ nhưng chưa được huy động. */
export const MAP_IDLE_COLOR = "var(--text-muted, #8a8f98)";
/** Điểm gặp nạn — cùng màu với vòng khoanh quanh nó. */
export const MAP_INCIDENT_COLOR = "var(--color-critical, #d64545)";

function divIcon(svg: string, size: number): L.DivIcon {
  return L.divIcon({
    html: svg,
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
    popupAnchor: [0, -size],
  });
}

/**
 * Hình SVG dùng chung với điện thoại (`@safestock/shared-types`), bọc lại thành
 * `L.DivIcon` cho Leaflet. Trước đây web giữ một bản SVG riêng và bản đồ trong app
 * giữ một bản khác — hai bên vẽ ra hai bộ ký hiệu cho cùng một loại kho.
 */
export { houseSvg, sosPinSvg, villaSvg } from "@safestock/shared-types";

export function houseIcon(color: string, size = 28): L.DivIcon {
  return divIcon(houseSvg(color, size), size);
}

export function villaIcon(color: string, size = 34): L.DivIcon {
  return divIcon(villaSvg(color, size), size);
}

export function sosPinIcon(size = 38, color = MAP_INCIDENT_COLOR): L.DivIcon {
  return divIcon(sosPinSvg(size, color), size);
}
