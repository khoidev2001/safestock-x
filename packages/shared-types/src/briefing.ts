/**
 * Cắt bản tin đầu ngày thành từng dòng để hiện theo gạch đầu dòng.
 *
 * Bản tin gộp bốn mảng vận hành — sẵn sàng, mưa, tồn kho, sự cố — vào một đoạn
 * liền. Đọc một đoạn như thế phải tự dò xem câu nào nói chuyện gì; mỗi mảng một
 * dòng thì liếc là ra.
 *
 * Chỉ cắt ở dấu chấm CUỐI CÂU, không cắt ở dấu chấm trong số thập phân
 * ("1.1 mm", "23.2 km/h") — đó là chỗ một hàm tách câu ngây thơ hay làm hỏng,
 * biến "1.1 mm" thành hai dòng vô nghĩa. Mà bản tin thì đầy số thập phân.
 *
 * Nằm ở gói dùng chung để web và điện thoại cắt GIỐNG HỆT nhau. Trước đây hàm
 * này chỉ có ở web, nên cùng một bản tin ra hai kiểu trên hai màn hình.
 */
export function splitBriefingSentences(narrative: string): string[] {
  return narrative
    .split(/(?<=[.!?])\s+(?=[^\d])/u)
    .map((part) => part.trim())
    .filter(Boolean);
}
