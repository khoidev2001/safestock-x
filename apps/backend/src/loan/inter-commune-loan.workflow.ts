export type LoanDirection = "OUTGOING" | "INCOMING";

export type LoanStatus =
  "REQUESTED" | "REJECTED" | "CANCELLED" | "APPROVED" | "ACTIVE" | "RETURNED";

/** Ai đang thao tác, xét từ phía bản ghi đang xử lý. */
export type LoanActor = "LENDER" | "BORROWER";

export interface LoanTransition {
  to: LoanStatus;
  /** Bên được phép thực hiện. Bên kia bấm được nút này là lỗi phân quyền. */
  by: LoanActor;
  /** Kho của bên thao tác thay đổi thế nào khi bước này xảy ra. */
  stock: "DEDUCT" | "ADD" | "NONE";
  label: string;
}

/**
 * Máy trạng thái của một khoản mượn giữa hai xã.
 *
 * Mỗi xã giữ một bản ghi riêng cho cùng một khoản mượn, nên bảng này mô tả trạng
 * thái CHUNG, còn việc kho ai thay đổi thì suy ra từ `direction` của bản ghi đang
 * xử lý — xem `stockEffect`.
 *
 * Nguyên tắc xuyên suốt: **hàng rời kho nào thì trừ kho đó ngay lúc rời, hàng vào
 * kho nào thì cộng lúc bên đó xác nhận đã nhận.** Không cộng trước khi hàng tới:
 * kho hiện số mình chưa cầm trong tay là con số dẫn tới điều phối sai.
 */
const TRANSITIONS: Record<LoanStatus, LoanTransition[]> = {
  REQUESTED: [
    // Bên cho mượn đồng ý: hàng rời kho họ ngay lúc này.
    { to: "APPROVED", by: "LENDER", stock: "DEDUCT", label: "Đồng ý cho mượn" },
    { to: "REJECTED", by: "LENDER", stock: "NONE", label: "Từ chối" },
    { to: "CANCELLED", by: "BORROWER", stock: "NONE", label: "Huỷ yêu cầu" },
  ],
  APPROVED: [
    // Bên mượn xác nhận đã nhận: giờ hàng mới vào kho họ.
    { to: "ACTIVE", by: "BORROWER", stock: "ADD", label: "Xác nhận đã nhận hàng" },
    // Đã đồng ý nhưng bên kia không tới lấy. Không có đường này thì hàng nằm treo
    // vĩnh viễn ngoài sổ: kho đã trừ mà chẳng ai đang giữ.
    { to: "CANCELLED", by: "LENDER", stock: "ADD", label: "Thu hồi, bên kia không nhận" },
  ],
  ACTIVE: [
    // Bên mượn trả: hàng rời kho họ.
    { to: "RETURNED", by: "BORROWER", stock: "DEDUCT", label: "Ghi nhận đã trả" },
  ],
  REJECTED: [],
  CANCELLED: [],
  RETURNED: [],
};

export function allowedTransitions(status: LoanStatus): LoanTransition[] {
  return TRANSITIONS[status] ?? [];
}

export function isTerminal(status: LoanStatus): boolean {
  return allowedTransitions(status).length === 0;
}

export function findTransition(from: LoanStatus, to: LoanStatus): LoanTransition | null {
  return allowedTransitions(from).find((item) => item.to === to) ?? null;
}

/** Bản ghi ở phía này thuộc về bên nào trong khoản mượn. */
export function actorOf(direction: LoanDirection): LoanActor {
  return direction === "OUTGOING" ? "LENDER" : "BORROWER";
}

/**
 * Kho của xã đang giữ bản ghi này thay đổi thế nào khi chuyển trạng thái.
 *
 * Đây là chỗ dễ sai nhất của cả tính năng, nên tách riêng và chốt bằng test: một
 * bước chuyển sinh ra HAI hiệu ứng ngược nhau ở hai xã, và bên nào chịu hiệu ứng
 * nào phụ thuộc bên đó là người cho mượn hay người đi mượn.
 *
 * Ví dụ bước "đồng ý cho mượn": kho bên CHO MƯỢN bị trừ, còn kho bên ĐI MƯỢN
 * chưa đụng tới — hàng chưa tới tay họ. Lấy nhầm dấu ở đây là hai xã cùng cộng
 * hoặc cùng trừ, và sổ sách lệch mà không ai thấy ngay.
 */
export function stockEffect(
  direction: LoanDirection,
  transition: LoanTransition,
): "DEDUCT" | "ADD" | "NONE" {
  // Hiệu ứng khai báo trong bảng là của BÊN THỰC HIỆN bước đó. Xã còn lại chỉ ghi
  // nhận trạng thái, kho không đổi.
  return actorOf(direction) === transition.by ? transition.stock : "NONE";
}

/**
 * Trạng thái khởi đầu khi ghi tay lúc mất mạng.
 *
 * Ghi tay nghĩa là hai bên đã thoả thuận qua điện thoại và hàng đã chuyển xong.
 * Bắt bản ghi đó đi lại từ REQUESTED là bắt người dùng bấm ba nút giả cho một
 * việc đã xong — và trong lúc bấm, kho sẽ bị trừ thêm lần nữa.
 */
export const MANUAL_INITIAL_STATUS: LoanStatus = "ACTIVE";
