import L from "leaflet";

/**
 * Hình vẽ cho các điểm trên bản đồ — MỘT nguồn cho cả bản đồ kho lẫn bản đồ điều
 * phối cứu hộ.
 *
 * Trước đây mỗi bản đồ tự vẽ lấy: bên điều phối là ngôi nhà, bên bản đồ kho là
 * dấu ghim. Cùng một cái kho, cùng một cán bộ nhìn, mà hai tab lại vẽ hai kiểu —
 * người dùng phải học lại chú giải mỗi lần chuyển tab.
 *
 * Ba hình, ba vai:
 *   - Nhà thường  → kho thôn
 *   - Nhà lớn     → kho tổng xã, to hơn và có nhiều cửa sổ, nhìn là biết đây là
 *                   nơi trữ chính chứ không phải một kho lẻ
 *   - Nhà cảnh báo→ điểm gặp nạn; vẫn là ngôi nhà (chỗ có người ở, có việc xảy
 *                   ra) nhưng tô đỏ và mang dấu chấm than thay cho ô cửa
 *
 * Chân nhà đặt đúng vào toạ độ (`iconAnchor` ở đáy) để nhà "đứng" trên vị trí
 * thật, không lơ lửng lệch lên trên như khi neo vào tâm.
 */

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
export function houseIcon(color: string, size = 28): L.DivIcon {
  return divIcon(
    svgWrap(
      size,
      color,
      `<path d="M12 3 21.2 10.4V20a1 1 0 0 1-1 1H3.8a1 1 0 0 1-1-1v-9.6z"/>` +
        `<path d="M9.7 21v-6.2h4.6V21" fill="white" stroke="none"/>`,
    ),
    size,
  );
}

/**
 * Nhà lớn hai tầng cửa sổ — kho tổng xã.
 *
 * Khác nhà thường ở ba chỗ đọc được từ xa: thân rộng hơn, mái vươn ra hai bên, và
 * có bốn ô cửa sổ. Chỉ phóng to ngôi nhà thường lên thì ở mức thu nhỏ nó chỉ là
 * "cùng một cái nhà, hơi to hơn" — không phân biệt được khi hai kho đứng gần nhau.
 */
export function villaIcon(color: string, size = 34): L.DivIcon {
  return divIcon(
    svgWrap(
      size,
      color,
      `<path d="M12 2.4 23 10.2h-2.2V20a1 1 0 0 1-1 1H4.2a1 1 0 0 1-1-1v-9.8H1z"/>` +
        `<path d="M10.4 21v-5.1h3.2V21" fill="white" stroke="none"/>` +
        `<rect x="5.4" y="12.2" width="2.9" height="2.6" rx="0.4" fill="white" stroke="none"/>` +
        `<rect x="15.7" y="12.2" width="2.9" height="2.6" rx="0.4" fill="white" stroke="none"/>`,
    ),
    size,
  );
}

/**
 * Nhà mang dấu chấm than — điểm gặp nạn.
 *
 * Dùng lại thân nhà chứ không phải dấu ghim: chỗ xảy ra việc là chỗ có người ở,
 * và trên bản đồ này thì thứ cần so sánh với nhau là "nhà nào đang cần cứu, kho
 * nào cấp được hàng". Dấu ghim và ngôi nhà đặt cạnh nhau đọc thành hai loại vật
 * thể khác nhau, phải dừng lại đối chiếu chú giải.
 *
 * Dấu chấm than thay cho ô cửa để phân biệt với kho ngay cả khi in đen trắng hay
 * khi người xem không phân biệt được màu đỏ với màu xanh.
 */
export function alertHouseIcon(color: string, size = 34): L.DivIcon {
  return divIcon(
    svgWrap(
      size,
      color,
      `<path d="M12 3 21.2 10.4V20a1 1 0 0 1-1 1H3.8a1 1 0 0 1-1-1v-9.6z"/>` +
        `<rect x="11.05" y="11.6" width="1.9" height="4.6" rx="0.9" fill="white" stroke="none"/>` +
        `<circle cx="12" cy="18.5" r="1.1" fill="white" stroke="none"/>`,
    ),
    size,
  );
}
