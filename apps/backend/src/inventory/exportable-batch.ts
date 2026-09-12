import { ItemCondition, ItemStatus, Prisma } from "@prisma/client";

/**
 * Điều kiện để một lô hàng xuất kho được — NGUỒN DUY NHẤT.
 *
 * VÌ SAO TÁCH RA: chốt thật nằm trong `InventoryService.bulkExport`, kiểm bốn thứ
 * trên bản ghi đã đọc lên và ném ra bốn câu lỗi khác nhau. Nhưng chỗ CHỌN lô thì
 * lại là một câu truy vấn, và nếu câu đó không lọc đúng bốn điều kiện ấy thì nó
 * chọn ra một lô mà chốt kia sẽ từ chối.
 *
 * Hậu quả không phải là một lỗi hiển thị. Giao diện mượn trả không hỏi mã lô —
 * người dùng chỉ chọn TÊN vật tư, máy tự chọn lô. Chọn trúng lô không xuất được
 * là người dùng nhận một câu lỗi về lô họ chưa từng thấy, và **không có cách nào
 * chọn lô khác**. Khoản mượn kẹt vĩnh viễn ở ACTIVE: hàng ngoài đời đã trả rồi mà
 * sổ vẫn ghi đang nợ.
 *
 * Đã xảy ra thật (2026-09-12) khi chạy thử trọn vòng mượn trả liên xã:
 *   - lần một chọn trúng lô `MAINTENANCE` đã hết hạn từ 23/07
 *   - vá riêng trạng thái xong, lần hai chọn trúng lô `EXPIRING_SOON` hết hạn 27/08
 * Hai lần vấp hai chốt khác nhau — đúng cái giá của việc chép tay danh sách điều
 * kiện ở hai nơi. Nên từ đây chỉ có một nơi.
 */

/** Trạng thái lô cho phép xuất. */
export const EXPORTABLE_STATUSES: ReadonlySet<ItemStatus> = new Set([
  ItemStatus.AVAILABLE,
  ItemStatus.EXPIRING_SOON,
]);

/** Tình trạng vật lý cho phép xuất. */
export const EXPORTABLE_CONDITIONS: ReadonlySet<ItemCondition> = new Set([
  ItemCondition.NEW,
  ItemCondition.USED,
]);

/**
 * Mệnh đề `where` lọc đúng những lô mà `bulkExport` sẽ chấp nhận.
 *
 * Nhận `now` làm tham số thay vì tự gọi `Date.now()`: hạn dùng so với thời điểm
 * nào là chuyện của chỗ gọi, và truyền vào thì test cố định được mốc thời gian.
 *
 * Chỉ `expiryDate` mới cho phép rỗng, nên chỉ nó cần nhánh `null`. `status` và
 * `condition` đều có giá trị mặc định trong schema — `bulkExport` viết
 * `before.status && ...` là thủ thế thừa, không phải dấu hiệu cột rỗng được.
 *
 * Lô KHÔNG có hạn dùng vẫn xuất được: không có hạn nghĩa là không hết hạn, và
 * loại chúng ra là tự chặn phần lớn vật tư tái sử dụng như áo phao hay xuồng.
 */
export function exportableBatchWhere(now: Date = new Date()): Prisma.ItemBatchWhereInput {
  return {
    status: { in: [...EXPORTABLE_STATUSES] },
    condition: { in: [...EXPORTABLE_CONDITIONS] },
    OR: [{ expiryDate: null }, { expiryDate: { gt: now } }],
    shelf: { is: { isLocked: false } },
  };
}
