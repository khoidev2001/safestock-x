/**
 * Logic thuần của luồng thông báo — không React, không socket, để test chạy được
 * bằng `node --test` mà không cần dựng cả app.
 */

/** Một lượt thông báo nổi ở đầu màn hình sống 5 giây rồi tự tắt. */
export const TOAST_VISIBLE_MS = 5000;

/**
 * Số thông báo nổi tối đa cùng lúc.
 *
 * Khi có bão thì thông báo về dồn dập; không chặn thì chúng xếp kín màn hình và
 * che mất chính cái việc người dùng đang làm. Cái thứ ba đẩy cái cũ nhất ra, và
 * tất cả vẫn nằm nguyên trong tab Thông báo.
 *
 * Để là HAI chứ không phải ba: thẻ thông báo đã được phóng to cho dễ thấy, ba
 * cái chồng lên nhau là chiếm quá nửa màn hình điện thoại.
 */
export const MAX_VISIBLE_TOASTS = 2;

export interface ToastEntry {
  /**
   * Khoá riêng của LƯỢT HIỆN, không phải id thông báo.
   *
   * Máy chủ có thể gửi lại cùng một thông báo sau khi cập nhật (updateAndPush),
   * và lúc đó nó phải nổi lên lần nữa. Nếu lấy id làm khoá thì React coi là cùng
   * một phần tử, giữ nguyên bộ đếm 5 giây cũ và thông báo mới có khi tắt ngay.
   */
  key: string;
  id: string;
  kind: string;
  title: string;
  body: string;
  missionId: string | null;
}

/** Thêm một lượt lên ĐẦU chồng, đẩy các lượt cũ xuống, cắt phần vượt quá. */
export function pushToast(
  stack: ToastEntry[],
  entry: ToastEntry,
  max: number = MAX_VISIBLE_TOASTS,
): ToastEntry[] {
  if (max <= 0) return [];
  return [entry, ...stack.filter((item) => item.key !== entry.key)].slice(0, max);
}

/** Bỏ một lượt khỏi chồng — hết 5 giây, hoặc người dùng bấm vào nó. */
export function dismissToast(stack: ToastEntry[], key: string): ToastEntry[] {
  return stack.filter((item) => item.key !== key);
}

/** Thứ cần có để xếp một thông báo theo dòng thời gian. */
export interface TimestampedNotification {
  id: string;
  createdAt?: string | null;
}

/**
 * Xếp danh sách thông báo theo DÒNG THỜI GIAN — mới nhất luôn ở đầu.
 *
 * Trước đây màn hình không xếp gì cả: nó tin vào thứ tự máy chủ trả về, cộng với
 * mẹo "chèn cái vừa nhận lên đầu". Hai nguồn đó không phải lúc nào cũng nói cùng
 * một điều, và mỗi lần chúng lệch nhau là một thông báo mới nằm lẫn ở giữa danh
 * sách:
 *
 * - Bản lưu ngoại tuyến đọc từ ổ đĩa xong SAU khi socket đã đẩy về vài thông báo,
 *   và nó ghi đè cả danh sách bằng bản chụp cũ.
 * - Máy chủ gửi lại một thông báo CŨ vừa được cập nhật nội dung; mẹo chèn lên đầu
 *   đẩy nó lên trên những thông báo thật sự mới hơn.
 * - Hai thông báo sinh ra trong cùng một transaction mang đúng một mốc giờ, và
 *   không có mốc phụ thì thứ tự giữa chúng đổi mỗi lượt tải.
 *
 * Xếp lại ở đây thì mọi đường đi vào danh sách — tải lần đầu, bản lưu, socket —
 * đều cho ra cùng một thứ tự, và thứ tự đó khớp với thứ tự người dùng thấy sau
 * khi tắt app mở lại.
 *
 * `id` làm mốc phụ: cuid tăng dần theo thời gian tạo, nên hai thông báo cùng mốc
 * giờ vẫn có một thứ tự ổn định thay vì nhảy chỗ mỗi lần vẽ lại.
 */
export function sortNotificationsNewestFirst<T extends TimestampedNotification>(list: T[]): T[] {
  return [...list].sort((left, right) => {
    const leftAt = Date.parse(left.createdAt ?? "");
    const rightAt = Date.parse(right.createdAt ?? "");
    const leftValid = Number.isFinite(leftAt);
    const rightValid = Number.isFinite(rightAt);
    // Bản ghi thiếu giờ (dữ liệu cũ, bản lưu hỏng) xuống cuối chứ không được coi
    // là mốc 0 — coi là 0 thì nó chen vào giữa và đẩy thứ tự lệch hẳn.
    if (!leftValid && !rightValid) return right.id.localeCompare(left.id);
    if (!leftValid) return 1;
    if (!rightValid) return -1;
    if (leftAt !== rightAt) return rightAt - leftAt;
    return right.id.localeCompare(left.id);
  });
}

/**
 * Chèn thông báo vừa tới vào danh sách: mới nhất lên đầu, cùng id thì thay chỗ
 * cái cũ chứ không nhân đôi.
 *
 * Xếp lại cả danh sách thay vì chèn thẳng lên đầu. Máy chủ có gửi lại một thông
 * báo cũ vừa sửa nội dung thì nó về đúng chỗ theo giờ của nó, không trèo lên trên
 * những việc mới hơn — nhãn MỚI vẫn đủ để mắt bắt được nó.
 */
export function mergeNotification<T extends TimestampedNotification>(list: T[], incoming: T): T[] {
  return sortNotificationsNewestFirst([
    incoming,
    ...list.filter((item) => item.id !== incoming.id),
  ]);
}

/** Thứ cần có để lọc được một thông báo theo số hiệu nhiệm vụ. */
export interface SearchableNotification {
  title: string;
  missionNo?: number | null;
}

/**
 * Chỉ giữ chữ số trong từ khoá.
 *
 * Người trực gõ theo cách họ nói: "193", "số 193", "#193" — cả ba là một ý. Trên
 * điện thoại còn hay lọt dấu cách do bàn phím số, nên lọc sạch rồi hãy so.
 */
export function missionNoQuery(input: string): string {
  return input.replace(/\D/g, "");
}

/**
 * Lọc thông báo theo số hiệu nhiệm vụ.
 *
 * Người trực nhớ nhiệm vụ bằng SỐ — "nhiệm vụ 193 sao rồi" — chứ không nhớ nó
 * nằm ở dòng thứ mấy trong danh sách. Sau một đêm bão thì danh sách dài vài chục
 * dòng và cuộn tay để tìm lại một số là việc vô vọng.
 *
 * So khớp theo kiểu CHỨA chứ không phải bằng đúng: gõ "19" ra cả 19, 190, 193 —
 * người gõ dở chừng vẫn thấy thứ mình cần thu hẹp dần trước mắt.
 *
 * Bản ghi cũ không có `missionNo` (máy chủ chỉ mới chép số hiệu về sau) thì tìm
 * trong TIÊU ĐỀ, nơi số hiệu được viết ra. Cố ý không dò cả phần nội dung: ở đó
 * đầy số lượng hàng và số người, "120 chai" sẽ khớp với từ khoá "12".
 */
export function filterNotificationsByMissionNo<T extends SearchableNotification>(
  items: T[],
  query: string,
): T[] {
  const digits = missionNoQuery(query);
  if (!digits) return items;
  return items.filter((item) => {
    if (item.missionNo != null) return String(item.missionNo).includes(digits);
    return (item.title.match(/\d+/g) ?? []).some((number) => number.includes(digits));
  });
}
