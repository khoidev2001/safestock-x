import L from "leaflet";

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

function svgWrap(size: number, color: string, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="${color}" stroke="white" stroke-width="1.6" stroke-linejoin="round">${body}</svg>`;
}

/** Ngôi nhà một tầng, một cửa — kho thôn. */
export function houseSvg(color: string, size = 28): string {
  return svgWrap(
    size,
    color,
    `<path d="M12 3 21.2 10.4V20a1 1 0 0 1-1 1H3.8a1 1 0 0 1-1-1v-9.6z"/>` +
      `<path d="M9.7 21v-6.2h4.6V21" fill="white" stroke="none"/>`,
  );
}

export function houseIcon(color: string, size = 28): L.DivIcon {
  return divIcon(houseSvg(color, size), size);
}

/**
 * Nhà lớn hai tầng cửa sổ — kho tổng xã.
 *
 * Khác nhà thường ở ba chỗ đọc được từ xa: thân rộng hơn, mái vươn ra hai bên, và
 * có bốn ô cửa sổ. Chỉ phóng to ngôi nhà thường lên thì ở mức thu nhỏ nó chỉ là
 * "cùng một cái nhà, hơi to hơn" — không phân biệt được khi hai kho đứng gần nhau.
 * Nhờ vậy bỏ màu xanh riêng cho kho tổng đi vẫn không lẫn với kho thôn.
 */
export function villaSvg(color: string, size = 34): string {
  return svgWrap(
    size,
    color,
    `<path d="M12 2.4 23 10.2h-2.2V20a1 1 0 0 1-1 1H4.2a1 1 0 0 1-1-1v-9.8H1z"/>` +
      `<path d="M10.4 21v-5.1h3.2V21" fill="white" stroke="none"/>` +
      `<rect x="5.4" y="12.2" width="2.9" height="2.6" rx="0.4" fill="white" stroke="none"/>` +
      `<rect x="15.7" y="12.2" width="2.9" height="2.6" rx="0.4" fill="white" stroke="none"/>`,
  );
}

export function villaIcon(color: string, size = 34): L.DivIcon {
  return divIcon(villaSvg(color, size), size);
}

/**
 * Ghim địa điểm mang chữ SOS — điểm gặp nạn.
 *
 * Trước đây vẽ bằng một ngôi nhà tô đỏ. Đứng giữa một bản đồ toàn nhà kho thì nó
 * chỉ khác nhau ở màu, mà màu là thứ mất đầu tiên khi in đen trắng, khi ảnh vệ
 * tinh phía sau đã ngả đỏ, hoặc với người không phân biệt được đỏ–xanh. Ghim là
 * hình DUY NHẤT trên bản đồ này không phải ngôi nhà, nên nhận ra được bằng dáng;
 * chữ SOS nói thẳng đây là chỗ cần cứu, không cần tra chú giải.
 */
export function sosPinSvg(size = 38, color = MAP_INCIDENT_COLOR): string {
  // Chữ SOS cam trên nền tròn trắng: đọc được cả khi ghim nằm trên mái nhà tối
  // màu của ảnh vệ tinh, và tương phản với thân ghim đỏ nên không bị nhoè vào nhau.
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none">` +
    `<path d="M12 1.2a8.4 8.4 0 0 0-8.4 8.4c0 6.1 7.6 12.6 7.9 12.9a.8.8 0 0 0 1 0c.3-.3 7.9-6.8 7.9-12.9A8.4 8.4 0 0 0 12 1.2z" fill="${color}" stroke="white" stroke-width="1.3" stroke-linejoin="round"/>` +
    `<circle cx="12" cy="9.6" r="5.2" fill="#f7f7f7"/>` +
    `<text x="12" y="9.7" text-anchor="middle" dominant-baseline="central" font-family="Inter, Arial, Helvetica, sans-serif" font-size="4.9" font-weight="800" letter-spacing="-0.2" fill="#f4511e">SOS</text>` +
    `</svg>`
  );
}

export function sosPinIcon(size = 38, color = MAP_INCIDENT_COLOR): L.DivIcon {
  return divIcon(sosPinSvg(size, color), size);
}
