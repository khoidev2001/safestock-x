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
  /** Bước này có chuyển hàng nên phải chọn lô trước khi bấm. */
  needsBatch: boolean;
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
          needsBatch: true,
          needsQuantity: true,
          tone: "primary",
        },
      ];
    }
    return [];
  }

  const laBenChoMuon = direction === "OUTGOING";
  switch (status) {
    case "REQUESTED":
      return laBenChoMuon
        ? [
            { to: "APPROVED", label: "Đồng ý cho mượn", needsBatch: true, tone: "primary" },
            { to: "REJECTED", label: "Từ chối", needsBatch: false, tone: "danger" },
          ]
        : [{ to: "CANCELLED", label: "Huỷ yêu cầu", needsBatch: false, tone: "neutral" }];
    case "APPROVED":
      return laBenChoMuon
        ? [
            {
              to: "CANCELLED",
              label: "Thu hồi, bên kia không nhận",
              needsBatch: true,
              tone: "neutral",
            },
          ]
        : [{ to: "ACTIVE", label: "Xác nhận đã nhận hàng", needsBatch: true, tone: "primary" }];
    case "ACTIVE":
    case "PARTIALLY_RETURNED":
      return laBenChoMuon
        ? []
        : [
            {
              to: "PARTIALLY_RETURNED",
              label: "Ghi nhận đã trả",
              needsBatch: true,
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

/** Khoản còn phải theo dõi, tách khỏi khoản đã đóng sổ. */
export function isOpen(status: InterCommuneStatus): boolean {
  return ["REQUESTED", "APPROVED", "ACTIVE", "PARTIALLY_RETURNED"].includes(status);
}
