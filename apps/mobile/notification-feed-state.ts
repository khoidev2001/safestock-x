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

/**
 * Chèn thông báo vừa tới vào danh sách: mới nhất lên đầu, cùng id thì thay chỗ
 * cái cũ chứ không nhân đôi.
 */
export function mergeNotification<T extends { id: string }>(list: T[], incoming: T): T[] {
  return [incoming, ...list.filter((item) => item.id !== incoming.id)];
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
