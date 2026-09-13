/**
 * Dải báo lỗi trượt lên từ đáy màn — phần quyết định, tách riêng để khoá bằng test.
 *
 * VÌ SAO KHÔNG DÙNG DÒNG CHỮ Ở ĐẦU TRANG NỮA
 *
 * Lỗi đang hiện thành một dòng chữ đỏ nằm trên đầu nội dung. Người dùng vừa bấm
 * một nút ở giữa hoặc cuối màn thì mắt họ đang ở đó, còn dòng báo lại xuất hiện
 * ngoài tầm nhìn — có khi phải cuộn lên mới thấy. Kết quả là họ bấm lại lần nữa,
 * tưởng máy không ăn.
 *
 * VÌ SAO KHÔNG DÙNG HỘP THOẠI CHẶN
 *
 * `Alert` chặn cả màn và bắt bấm OK. Lỗi tải nền lặp lại mỗi lượt làm mới, nên
 * lúc mất sóng nó sẽ nổ liên tục và biến ứng dụng thành không dùng được — đúng
 * lúc ngoài hiện trường cần dùng nhất.
 *
 * Dải trượt từ đáy: nằm ngay dưới ngón tay vừa bấm, tự tắt, không chắn gì.
 */

/** Bao lâu thì dải tự tắt. 6 giây: đủ đọc một câu tiếng Việt hai dòng. */
export const ERROR_BANNER_VISIBLE_MS = 6000;

export interface ErrorBanner {
  /** Đổi mỗi lần hiện, để lớp hiển thị biết phải chạy lại hoạt ảnh. */
  key: string;
  message: string;
}

/**
 * Lỗi mới THAY THẾ lỗi đang hiện, không xếp hàng chồng lên nhau.
 *
 * Xếp chồng là sai với thứ này: khi mất sóng thì mọi lời gọi hỏng gần như cùng
 * lúc, chồng lên nhau sẽ phủ kín màn hình bằng cùng một câu lặp lại. Người dùng
 * chỉ cần biết "vừa hỏng, vì cái gì" — cái mới nhất luôn đúng hơn cái cũ.
 *
 * Lặp lại ĐÚNG một câu thì giữ nguyên dải đang hiện, không làm mới bộ đếm: nếu
 * không, lỗi làm mới nền cứ 15 giây một lần sẽ giữ dải ở lại vĩnh viễn.
 */
export function nextErrorBanner(
  current: ErrorBanner | null,
  message: string,
  now: number,
): ErrorBanner | null {
  const trimmed = message.trim();
  // Chuỗi rỗng không phải là lỗi — gọi nhầm thì đừng hiện một dải trống trơn.
  if (!trimmed) return current;
  if (current && current.message === trimmed) return current;
  return { key: `${now}`, message: trimmed };
}

/**
 * Còn phải hiện nữa không, xét theo thời điểm bắt đầu.
 *
 * Tách ra khỏi `setTimeout` để kiểm được bằng test mà không phải chờ thật, và để
 * lớp hiển thị chỉ còn mỗi việc vẽ.
 */
export function isBannerExpired(banner: ErrorBanner, startedAt: number, now: number): boolean {
  return now - startedAt >= ERROR_BANNER_VISIBLE_MS;
}
