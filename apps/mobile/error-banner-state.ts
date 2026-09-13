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

/**
 * Kênh phát lỗi: CHỈ dải được gắn SAU CÙNG nhận lỗi.
 *
 * VÌ SAO KHÔNG PHÁT CHO TẤT CẢ: các biểu mẫu kho mở bằng `Modal`, tức một CỬA SỔ
 * RIÊNG đè lên toàn bộ ứng dụng. Dải lỗi gắn ở gốc app nằm BÊN DƯỚI cửa sổ đó,
 * nên lỗi phát cho nó là lỗi bị chính biểu mẫu che mất: bấm "Xác nhận" xuất quá
 * tồn, nút quay "Đang xử lý…" rồi trở về, không một chữ — người trực không biết
 * vì sao kho không trừ.
 *
 * Nên mỗi biểu mẫu tự gắn một dải bên trong cửa sổ của nó. Dải mở sau cùng là
 * dải đang nằm trên cùng màn hình, nên nó nhận lỗi; biểu mẫu đóng thì dải của nó
 * gỡ ra và lỗi lại về dải bên dưới. Phát cho tất cả thì lỗi hiện hai lần, một
 * lần trong tầm mắt và một lần nằm chờ phía sau, rồi bật ra khi biểu mẫu đóng.
 */
export function createErrorChannel() {
  const stack: ((message: string) => void)[] = [];
  return {
    subscribe(listener: (message: string) => void): () => void {
      stack.push(listener);
      return () => {
        // Gỡ đúng listener này, không phải phần tử cuối: hai biểu mẫu có thể
        // đóng không theo thứ tự đã mở.
        const index = stack.lastIndexOf(listener);
        if (index >= 0) stack.splice(index, 1);
      };
    },
    emit(message: string): void {
      stack[stack.length - 1]?.(message);
    },
  };
}
