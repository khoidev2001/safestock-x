/**
 * Cách viết ngày giờ dùng chung cho cả web.
 *
 * GHÉP TAY, không qua `Intl.DateTimeFormat("vi-VN")`. Nghe thì ngược đời, nhưng
 * cách viết ngày của `vi-VN` do TRÌNH DUYỆT quyết định chứ không phải chuẩn nào:
 * cùng một mốc thời gian, máy này hiện "05/09/2026", máy khác "5/9/26", máy khác
 * nữa "05-09-2026". Chrome và Firefox trên cùng một máy cũng đã khác nhau.
 *
 * Với phần lớn ứng dụng thì đó là chuyện nhỏ. Ở đây thì không: đây là con số cán bộ
 * xã đọc cho nhau qua điện thoại và chép vào biên bản giấy. Hai người nhìn hai máy
 * mà đọc ra hai ngày khác nhau là đủ để một cuộc đối chiếu hậu kiểm đi sai hướng.
 *
 * NĂM VIẾT ĐỦ BỐN CHỮ SỐ. "6/9/26" tiết kiệm được ba ký tự và đổi lại sự mơ hồ:
 * hồ sơ còn được tra lại sang năm sau, lúc đó phải biết là mùa lũ nào.
 */

const pad = (part: number) => String(part).padStart(2, "0");

function parse(value: string | Date): Date | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "06/09/2026" — luôn hai chữ số ngày, hai chữ số tháng, bốn chữ số năm. */
export function formatDayMonthYear(value: string | Date, fallback = "Không rõ ngày"): string {
  const date = parse(value);
  if (!date) return fallback;
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
}

/** "15:31" — 24 giờ, không SA/CH. */
export function formatHourMinute(value: string | Date, fallback = "--:--"): string {
  const date = parse(value);
  if (!date) return fallback;
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * "15:31 06/09/2026" — giờ trước, ngày sau.
 *
 * Giờ đứng trước vì trong lúc điều phối thì "mấy giờ" mới là thứ phân biệt các dòng
 * với nhau; ngày thường là hôm nay, và chỉ cần tới khi tra lại hồ sơ cũ.
 */
export function formatTimeAndDate(value: string | Date, fallback = "Không rõ thời gian"): string {
  const date = parse(value);
  if (!date) return fallback;
  return `${formatHourMinute(date)} ${formatDayMonthYear(date)}`;
}
