/**
 * Luật cuộn-tới-đâu-tải-tới-đó, tách riêng khỏi React để test chạy được bằng
 * `node --test` mà không phải dựng màn hình nào.
 *
 * Dùng chung cho hộp Thông báo và danh sách Nhiệm vụ: hai màn hình khác nhau về
 * nội dung nhưng giống hệt nhau về cách lật trang, và hai bản chép tay của cùng
 * một luật thì sớm muộn cũng lệch nhau ở đúng chỗ khó thấy nhất — dòng bị lặp
 * hoặc bị nhảy cóc ở ranh giới giữa hai trang.
 */

/**
 * Số bản ghi xin về mỗi lượt.
 *
 * Đủ để lấp kín một màn hình điện thoại và còn dư một ít (thẻ nhiệm vụ cao chừng
 * 120px, màn hình thường thấy hiện được 5–6 thẻ), nên người dùng thấy danh sách
 * đầy ngay chứ không thấy một khoảng trống rồi mới có hàng chạy vào. Lớn hơn thì
 * lượt tải đầu — lượt duy nhất người dùng phải ngồi chờ — dài ra vô ích.
 */
export const PAGE_SIZE = 20;

/** Thứ tối thiểu để ghép trang: bản ghi nào cũng phải có id riêng. */
export interface Identified {
  id: string;
}

/**
 * Ghép trang vừa tải vào cuối danh sách đang có, BỎ bản ghi trùng id.
 *
 * Trùng là chuyện bình thường chứ không phải lỗi: giữa lúc người dùng cuộn, một
 * thông báo mới về qua socket và chen lên đầu danh sách, nên trang sau xin từ con
 * trỏ cũ có thể trả lại một dòng đã nằm sẵn trên màn hình. React dựng danh sách
 * theo id, và hai phần tử cùng id là chỗ nó vẽ sai hoặc kêu lỗi.
 *
 * Bản ghi ĐANG CÓ thắng bản ghi vừa về: bản đang có có thể vừa được socket cập
 * nhật (thông báo được gửi lại sau khi sửa nội dung), còn bản trong trang là ảnh
 * chụp lúc máy chủ đọc bảng.
 */
export function appendPage<T extends Identified>(current: T[], page: T[]): T[] {
  const seen = new Set(current.map((item) => item.id));
  return [...current, ...page.filter((item) => !seen.has(item.id))];
}

/**
 * Còn trang sau nữa không.
 *
 * Suy ra từ chính số dòng nhận được: xin 20 mà về đủ 20 thì gần như chắc còn nữa,
 * về ít hơn thì đã chạm đáy. Cách này thừa ra đúng một lượt gọi khi tổng số bản
 * ghi chia hết cho cỡ trang — đổi lại máy chủ không phải đếm cả bảng ở mỗi lượt
 * cuộn chỉ để trả về một chữ "còn" hay "hết".
 */
export function hasMoreAfter(page: unknown[], pageSize: number = PAGE_SIZE): boolean {
  return page.length >= pageSize;
}

/**
 * Con trỏ cho lượt tải kế tiếp: id của bản ghi CUỐI CÙNG đang có.
 *
 * Lấy từ danh sách đã ghép chứ không từ trang vừa tải: nếu trang vừa rồi toàn
 * dòng trùng và bị bỏ hết, con trỏ vẫn phải nhích tiếp chứ không được đứng yên —
 * đứng yên là xin lại đúng trang ấy mãi mãi.
 */
export function nextCursor<T extends Identified>(items: T[]): string | null {
  return items.length > 0 ? items[items.length - 1].id : null;
}
