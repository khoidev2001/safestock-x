import { MissionWarehouseRequestStatus } from "@prisma/client";

/**
 * "Hàng đã rời kho chưa?" — câu hỏi mà HAI trạng thái cùng trả lời là RỒI.
 *
 * `PICKED_UP` được tách ra khỏi `PREPARED` về sau, vì "kho đã soạn" và "người đi
 * lấy đã ký nhận" là hai việc khác nhau. Nhưng mọi phép đếm tiến độ viết trước
 * đó đều hỏi `status = PREPARED`, và một yêu cầu vừa được ký nhận thì KHÔNG còn
 * PREPARED nữa — nó lặng lẽ rơi ra khỏi mọi phép đếm.
 *
 * Hậu quả thật đã gặp: kho soạn xong món thứ nhất, người đi lấy ký nhận ngay,
 * rồi kho soạn nốt món thứ hai. Lúc chốt, phép đếm "còn bao nhiêu chưa soạn" vẫn
 * thấy món thứ nhất (đang PICKED_UP) nên không bao giờ về 0: tiến độ kho đứng ở
 * 0/2 dù kho đã xuất hết, và nhiệm vụ kẹt vĩnh viễn ở PENDING_WAREHOUSE — đội
 * hiện trường không bao giờ thấy ô báo kết quả để đóng nhiệm vụ.
 *
 * Nên đừng so sánh trực tiếp với `PREPARED` ở bất cứ phép đếm tiến độ nào; hỏi
 * qua hai danh sách dưới đây.
 */
export const EXPORTED_REQUEST_STATUSES = [
  MissionWarehouseRequestStatus.PREPARED,
  MissionWarehouseRequestStatus.PICKED_UP,
] as const;

/** Phần kho còn nợ: chưa soạn xong, nên hàng vẫn nằm trên kệ. */
export const UNEXPORTED_REQUEST_STATUSES = [
  MissionWarehouseRequestStatus.PENDING,
  MissionWarehouseRequestStatus.ACCEPTED,
] as const;

/** Kho đã xuất phần này chưa — tính cả phần đã có người ký nhận mang đi. */
export function isRequestExported(status: MissionWarehouseRequestStatus): boolean {
  return (EXPORTED_REQUEST_STATUSES as readonly MissionWarehouseRequestStatus[]).includes(status);
}
