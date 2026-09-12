export type InterCommuneDirection = "OUTGOING" | "INCOMING";

/**
 * Trạng thái khoản mượn LIÊN XÃ.
 *
 * Tên có tiền tố vì Prisma đã xuất sẵn một `LoanStatus` khác hẳn (ON_LOAN,
 * PARTIALLY_RETURNED, CLOSED) cho khoản mượn TRONG xã. Hai kiểu cùng tên trong
 * cùng một service là cái bẫy nhập nhầm, mà nhập nhầm ở đây thì trạng thái khoản
 * nợ hiện sai.
 */
export type InterCommuneStatus =
  | "REQUESTED"
  | "REJECTED"
  | "CANCELLED"
  | "APPROVED"
  | "ACTIVE"
  | "PARTIALLY_RETURNED"
  | "RETURNED";

/** Ai đang thao tác, xét từ phía bản ghi đang xử lý. */
export type InterCommuneActor = "LENDER" | "BORROWER";

export interface InterCommuneTransition {
  to: InterCommuneStatus;
  /** Bên được phép thực hiện. Bên kia bấm được nút này là lỗi phân quyền. */
  by: InterCommuneActor;
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
const TRANSITIONS: Record<InterCommuneStatus, InterCommuneTransition[]> = {
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
    // Bên mượn trả: hàng rời kho họ. Trả thiếu thì dừng ở PARTIALLY_RETURNED,
    // vẫn còn nợ; xem `statusAfterReturn`.
    { to: "RETURNED", by: "BORROWER", stock: "DEDUCT", label: "Ghi nhận đã trả" },
    {
      to: "PARTIALLY_RETURNED",
      by: "BORROWER",
      stock: "DEDUCT",
      label: "Ghi nhận trả một phần",
    },
  ],
  PARTIALLY_RETURNED: [
    { to: "RETURNED", by: "BORROWER", stock: "DEDUCT", label: "Trả nốt phần còn lại" },
    { to: "PARTIALLY_RETURNED", by: "BORROWER", stock: "DEDUCT", label: "Trả thêm một phần" },
  ],
  REJECTED: [],
  CANCELLED: [],
  RETURNED: [],
};

export function allowedTransitions(status: InterCommuneStatus): InterCommuneTransition[] {
  return TRANSITIONS[status] ?? [];
}

export function isTerminal(status: InterCommuneStatus): boolean {
  return allowedTransitions(status).length === 0;
}

export function findTransition(
  from: InterCommuneStatus,
  to: InterCommuneStatus,
): InterCommuneTransition | null {
  return allowedTransitions(from).find((item) => item.to === to) ?? null;
}

/** Bản ghi ở phía này thuộc về bên nào trong khoản mượn. */
export function actorOf(direction: InterCommuneDirection): InterCommuneActor {
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
  direction: InterCommuneDirection,
  transition: InterCommuneTransition,
): "DEDUCT" | "ADD" | "NONE" {
  // Hiệu ứng khai báo trong bảng là của BÊN THỰC HIỆN bước đó. Xã còn lại chỉ ghi
  // nhận trạng thái, kho không đổi Ở ĐÂY.
  //
  // Riêng bước TRẢ, kho bên cho mượn PHẢI được cộng lại — nhưng không phải ở hàm
  // này. Bản ghi bên cho mượn không bao giờ đi qua `advance()`: bảng trạng thái
  // chốt mọi bước trả là `by: "BORROWER"`, nên `advance()` chặn bên cho mượn ngay
  // từ kiểm quyền. Đường duy nhất cập nhật bản ghi ấy là `syncStatusFromPeer`, và
  // phần cộng lại kho nằm ở đó.
  //
  // Đừng cộng thêm ở đây cho "chắc". Đã thử và gỡ ra: hai đường cùng cộng cho một
  // lần trả là kho tự sinh ra hàng, mà sai kiểu ấy khó thấy hơn hẳn sai kiểu mất
  // hàng — số chỉ phình lên chứ không có ai kêu thiếu.
  return actorOf(direction) === transition.by ? transition.stock : "NONE";
}

/**
 * Trạng thái khởi đầu khi ghi tay lúc mất mạng.
 *
 * Ghi tay nghĩa là hai bên đã thoả thuận qua điện thoại và hàng đã chuyển xong.
 * Bắt bản ghi đó đi lại từ REQUESTED là bắt người dùng bấm ba nút giả cho một
 * việc đã xong — và trong lúc bấm, kho sẽ bị trừ thêm lần nữa.
 */
export const MANUAL_INITIAL_STATUS: InterCommuneStatus = "ACTIVE";

/**
 * Trạng thái sau khi ghi nhận trả thêm một lượng.
 *
 * Tách riêng vì đây là chỗ duy nhất mà một bước chuyển có thể ra HAI đích khác
 * nhau tuỳ con số, và quyết định đó phải nằm cùng chỗ với luật trạng thái chứ
 * không nằm rải trong service.
 *
 * Trả dư bị chặn ở đây, không phải ở tầng giao diện: trả nhiều hơn số đã mượn là
 * cộng vào kho bên cho mượn phần hàng chưa từng rời kho họ — tự nhiên sinh ra
 * hàng trong sổ.
 */
export function statusAfterReturn(
  borrowed: number,
  alreadyReturned: number,
  returningNow: number,
): { status: InterCommuneStatus; totalReturned: number } {
  if (!Number.isInteger(returningNow) || returningNow <= 0) {
    throw new Error("Số lượng trả phải là số nguyên dương");
  }
  const totalReturned = alreadyReturned + returningNow;
  if (totalReturned > borrowed) {
    throw new Error(
      `Trả ${returningNow} là vượt phần còn nợ (${borrowed - alreadyReturned}/${borrowed})`,
    );
  }
  return {
    status: totalReturned === borrowed ? "RETURNED" : "PARTIALLY_RETURNED",
    totalReturned,
  };
}

/**
 * Kho thay đổi thế nào khi TẠO một bản ghi ghi tay lúc mất mạng.
 *
 * Bản ghi ghi tay bắt đầu thẳng ở ACTIVE, tức là nó KHÔNG đi qua bước "đồng ý
 * cho mượn" hay "xác nhận đã nhận" — mà hai bước đó mới là nơi mang hiệu ứng
 * kho. Không có hàm này thì hàng đã chuyển ngoài đời nhưng sổ vẫn nguyên: bên
 * cho mượn hiện thừa hàng mình đã đưa đi, bên mượn thiếu hàng đang cầm trong tay.
 *
 * Đây là lỗ hổng chỉ lộ ra khi ghép hai quyết định lại với nhau — "ghi tay bắt
 * đầu ở ACTIVE" và "hiệu ứng kho nằm ở các bước chuyển" — nên tách hẳn ra và ghi
 * rõ lý do.
 */
export function manualEntryStockEffect(
  direction: InterCommuneDirection,
): "DEDUCT" | "ADD" | "NONE" {
  // Cho mượn: hàng đã rời kho mình. Đi mượn: hàng đã vào kho mình.
  return direction === "OUTGOING" ? "DEDUCT" : "ADD";
}

/**
 * Hiệu ứng kho cho bản ghi GHI TAY, ở mọi bước.
 *
 * Bản ghi ghi tay không có bản ghi đối ứng ở xã kia — xã kia không đăng nhập vào
 * hệ thống này. Người giữ bản ghi làm thay cả hai vai: họ vừa ghi lúc đưa hàng đi,
 * vừa ghi lúc nhận hàng về. Vì vậy luật "bên nào thực hiện thì bên đó đổi kho"
 * không áp được, và nếu cứ áp thì `stockEffect` trả NONE cho mọi bước trả — hàng
 * quay về kho ngoài đời mà sổ đứng yên.
 *
 * Quy tắc đúng và duy nhất cần nhớ: **kho của người giữ bản ghi đổi theo hướng
 * hàng thật sự đi.**
 *
 *   cho mượn, lúc đưa đi   → trừ        cho mượn, lúc nhận về  → cộng
 *   đi mượn,  lúc nhận về  → cộng       đi mượn,  lúc trả đi   → trừ
 */
export function manualStockEffect(
  direction: InterCommuneDirection,
  to: InterCommuneStatus,
): "DEDUCT" | "ADD" | "NONE" {
  const isReturnStep = to === "RETURNED" || to === "PARTIALLY_RETURNED";
  if (isReturnStep) return direction === "OUTGOING" ? "ADD" : "DEDUCT";
  // Các bước còn lại của bản ghi ghi tay không chuyển hàng: khoản đã ở ACTIVE
  // ngay từ lúc tạo, nên không còn bước duyệt hay xác nhận nhận nào nữa.
  return "NONE";
}
