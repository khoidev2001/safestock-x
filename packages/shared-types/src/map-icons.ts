/**
 * Hình vẽ các điểm trên bản đồ — MỘT nguồn cho web và điện thoại.
 *
 * Trưởng thôn ghim một mái nhà trên điện thoại, điều phối viên mở web nhìn lại
 * đúng chỗ đó, rồi đội cứu hộ cầm điện thoại đi tới. Ba màn hình, một sự việc —
 * nên ba bên phải thấy CÙNG những hình vẽ, nếu không mỗi bên lại phải học một bộ
 * ký hiệu riêng và câu "kho thôn nằm ngay đây" không còn chỉ vào cùng một thứ.
 *
 * Chỉ có phần SVG THUẦN ở đây. Web bọc chúng thành `L.DivIcon` của Leaflet; điện
 * thoại nhúng thẳng chuỗi vào trang Leaflet chạy trong WebView. Hai cách gắn khác
 * nhau, nhưng hình thì chung một bản.
 *
 * Ba hình, ba vai:
 *   - Nhà thường  → kho thôn
 *   - Nhà lớn     → kho tổng xã: thân rộng, mái vươn hai bên, có cửa sổ, nhìn là
 *                   biết đây là nơi trữ chính chứ không phải một kho lẻ
 *   - Ghim SOS    → điểm gặp nạn, hình DUY NHẤT không phải ngôi nhà nên nhận ra
 *                   được bằng dáng, không phải bằng màu
 */

function svgWrap(size: number, color: string, body: string): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" ` +
    `fill="${color}" stroke="white" stroke-width="1.6" stroke-linejoin="round">${body}</svg>`
  );
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

/**
 * Nhà lớn hai tầng cửa sổ — kho tổng xã.
 *
 * Khác nhà thường ở ba chỗ đọc được từ xa: thân rộng hơn, mái vươn ra hai bên, và
 * có bốn ô cửa sổ. Chỉ phóng to ngôi nhà thường lên thì ở mức thu nhỏ nó chỉ là
 * "cùng một cái nhà, hơi to hơn" — không phân biệt được khi hai kho đứng gần nhau.
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

/**
 * Ghim địa điểm mang chữ SOS — điểm gặp nạn.
 *
 * Trước đây vẽ bằng một ngôi nhà tô đỏ. Đứng giữa một bản đồ toàn nhà kho thì nó
 * chỉ khác nhau ở màu, mà màu là thứ mất đầu tiên khi in đen trắng, khi ảnh vệ
 * tinh phía sau đã ngả đỏ, hoặc với người không phân biệt được đỏ–xanh. Chữ SOS
 * nói thẳng đây là chỗ cần cứu, không cần tra chú giải.
 */
export function sosPinSvg(size = 38, color = "#d64545"): string {
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
