export type InterCommuneDirection = "OUTGOING" | "INCOMING";

export type InterCommuneStatus =
  | "REQUESTED"
  | "REJECTED"
  | "APPROVED"
  | "ACTIVE"
  | "PARTIALLY_RETURNED"
  | "RETURNED"
  | "CANCELLED";

export interface LoanAction {
  to: InterCommuneStatus;
  label: string;
  /**
   * Bước này có chuyển hàng thật, tức kho sẽ cộng hoặc trừ ngay khi bấm.
   *
   * KHÔNG còn dùng để bắt nhập mã lô — máy chủ tự chọn lô theo nguyên tắc hạn
   * gần xuất trước. Giữ lại vì giao diện phải nói trước cho người bấm biết nút
   * nào chỉ đổi trạng thái trên sổ và nút nào làm hàng rời kho.
   */
  movesStock: boolean;
  /** Nhập được số lượng trả từng phần. */
  needsQuantity?: boolean;
  tone: "primary" | "danger" | "neutral";
}

/**
 * Những nút được phép hiện cho một khoản mượn liên xã.
 *
 * Giao diện KHÔNG tự nghĩ ra luật: nó chỉ hiện đúng những bước mà máy chủ sẽ
 * chấp nhận. Bày một nút rồi để máy chủ từ chối là dạy người dùng rằng nút trên
 * màn hình không đáng tin — và lúc thật sự cần bấm thì họ do dự.
 *
 * Bản ghi ghi tay là ngoại lệ có chủ đích: nó không có bản ghi đối ứng ở xã kia
 * nên người giữ nó làm thay cả hai vai, và chỉ còn việc ghi nhận trả.
 */
export function loanActions(
  direction: InterCommuneDirection,
  status: InterCommuneStatus,
  recordedManually: boolean,
): LoanAction[] {
  if (recordedManually) {
    if (status === "ACTIVE" || status === "PARTIALLY_RETURNED") {
      return [
        {
          to: "PARTIALLY_RETURNED",
          label: direction === "OUTGOING" ? "Ghi nhận nhận lại" : "Ghi nhận đã trả",
          movesStock: true,
          needsQuantity: true,
          tone: "primary",
        },
      ];
    }
    return [];
  }

  const isLender = direction === "OUTGOING";
  switch (status) {
    case "REQUESTED":
      return isLender
        ? [
            { to: "APPROVED", label: "Đồng ý cho mượn", movesStock: true, tone: "primary" },
            { to: "REJECTED", label: "Từ chối", movesStock: false, tone: "danger" },
          ]
        : [{ to: "CANCELLED", label: "Huỷ yêu cầu", movesStock: false, tone: "neutral" }];
    case "APPROVED":
      return isLender
        ? [
            {
              to: "CANCELLED",
              label: "Thu hồi, bên kia không nhận",
              movesStock: true,
              tone: "neutral",
            },
          ]
        : [{ to: "ACTIVE", label: "Xác nhận đã nhận hàng", movesStock: true, tone: "primary" }];
    case "ACTIVE":
    case "PARTIALLY_RETURNED":
      return isLender
        ? []
        : [
            {
              to: "PARTIALLY_RETURNED",
              label: "Ghi nhận đã trả",
              movesStock: true,
              needsQuantity: true,
              tone: "primary",
            },
          ];
    default:
      return [];
  }
}

/** Số còn nợ. Đây là con số người dùng thật sự cần liếc thấy. */
export function outstanding(quantity: number, returnedQuantity: number): number {
  return Math.max(0, quantity - returnedQuantity);
}

export function statusLabel(status: InterCommuneStatus): string {
  return (
    {
      REQUESTED: "Chờ bên kia quyết",
      APPROVED: "Đã đồng ý, chờ nhận hàng",
      ACTIVE: "Đang nợ",
      PARTIALLY_RETURNED: "Đã trả một phần",
      RETURNED: "Đã trả xong",
      REJECTED: "Bị từ chối",
      CANCELLED: "Đã huỷ",
    }[status] ?? status
  );
}

/** Khoản còn phải theo dõi, xét THEO TRẠNG THÁI. Xem `isLoanOpen` trước khi dùng. */
export function isOpen(status: InterCommuneStatus): boolean {
  return ["REQUESTED", "APPROVED", "ACTIVE", "PARTIALLY_RETURNED"].includes(status);
}

/**
 * Khoản còn phải theo dõi, xét trên CẢ khoản mượn chứ không chỉ trạng thái.
 *
 * Vì sao không dùng mỗi `isOpen(status)`: trạng thái nói bên MƯỢN đã trả tới đâu.
 * Bên mượn trả nốt là trạng thái thành RETURNED ngay, nhưng bên CHO MƯỢN có thể
 * chưa xác nhận cầm được — hàng vẫn đang trên đường.
 *
 * Đã xảy ra thật khi chạy thử: trả nốt 25 xong, khoản rơi vào mục "đã đóng sổ",
 * nút "Xác nhận đã nhận lại" biến mất, và 25 bộ mắc kẹt vĩnh viễn — kho bên cho
 * mượn đứng ở 475 thay vì 500.
 */
export function isLoanOpen(loan: {
  status: InterCommuneStatus;
  direction: InterCommuneDirection;
  returnedQuantity: number;
  returnAcceptedQuantity: number;
}): boolean {
  if (isOpen(loan.status)) return true;
  return (
    loan.direction === "OUTGOING" && loan.returnAcceptedQuantity < loan.returnedQuantity
  );
}
