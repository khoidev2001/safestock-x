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

/**
 * Tin báo về việc yêu cầu mượn đã sang tới xã kia chưa.
 *
 * VÌ SAO PHẢI TÁCH BA TRẠNG THÁI: `peerLoanId` rỗng có HAI nghĩa khác hẳn nhau.
 * Lần gửi đầu tiên chạy nền sau khi máy chủ đã trả lời cho trình duyệt (xem
 * `sendToPeer` ở backend), nên trong một hai giây đầu nó rỗng mà chưa hỏng gì.
 * Chỉ khi máy chủ đã thử và thất bại thì `peerDeliveryError` mới được ghi.
 *
 * Trước đây màn hình chỉ nhìn `peerLoanId` nên hét "chưa gửi được" ngay giữa lúc
 * đang gửi bình thường, rồi tự hết. Báo động giả kiểu ấy tệ hơn không báo: người
 * trực sẽ gọi điện báo xã kia một khoản mà lát nữa họ nhận được thật, hoặc quen
 * mắt rồi bỏ qua luôn cả lần hỏng thật.
 *
 * Chỉ xét khoản ĐI MƯỢN đang chờ duyệt: khoản cho mượn thì bản ghi sinh ra từ
 * chính lời gọi của xã kia, không có chuyện chưa gửi tới.
 */
export type PeerDeliveryNotice = "none" | "sending" | "failed";

export function peerDeliveryNotice(loan: {
  direction: InterCommuneDirection;
  status: InterCommuneStatus;
  peerLoanId: string | null;
  peerDeliveryError: string | null;
}): PeerDeliveryNotice {
  if (loan.direction !== "INCOMING" || loan.status !== "REQUESTED") return "none";
  if (loan.peerLoanId) return "none";
  return loan.peerDeliveryError ? "failed" : "sending";
}

/**
 * Khoản này đang chờ CHÍNH MÌNH làm gì đó, hay chờ xã bên kia.
 *
 * Mỗi trạng thái có đúng một bên phải ra tay tiếp theo, và bên đó đổi theo hướng
 * của khoản mượn: cùng là REQUESTED nhưng bên cho mượn phải quyết, còn bên đi
 * mượn chỉ ngồi chờ (nút "Huỷ yêu cầu" là quyền, không phải việc phải làm).
 *
 * Ngoại lệ đứng trước mọi trạng thái: bên CHO MƯỢN chưa xác nhận cầm lại đủ hàng
 * thì vẫn là việc của mình, kể cả khi sổ đã ghi RETURNED — cùng lý do với
 * `isLoanOpen`, hàng đã rời kho bên kia nhưng chưa ai xác nhận nó về tới nơi.
 *
 * Khoản ghi tay không có xã nào bên kia để chờ: người giữ sổ làm cả hai vai.
 */
export function waitingOnMe(loan: {
  direction: InterCommuneDirection;
  status: InterCommuneStatus;
  recordedManually: boolean;
  returnedQuantity: number;
  returnAcceptedQuantity: number;
}): boolean {
  if (loan.recordedManually) {
    return loan.status === "ACTIVE" || loan.status === "PARTIALLY_RETURNED";
  }
  if (loan.direction === "OUTGOING" && loan.returnAcceptedQuantity < loan.returnedQuantity) {
    return true;
  }
  switch (loan.status) {
    case "REQUESTED":
      return loan.direction === "OUTGOING";
    case "APPROVED":
    case "ACTIVE":
    case "PARTIALLY_RETURNED":
      return loan.direction === "INCOMING";
    default:
      return false;
  }
}

/**
 * Xếp lại sổ mượn: việc của mình lên đầu.
 *
 * VÌ SAO CẦN: trước đây danh sách giữ nguyên thứ tự máy chủ trả về, mà thứ tự ấy
 * gom theo TRẠNG THÁI. Hậu quả là ba khoản "chờ bên kia quyết" — không làm gì
 * được — nằm trên, còn khoản duy nhất đang chờ mình bấm "Xác nhận đã nhận hàng"
 * bị đẩy xuống cuối. Người trực phải cuộn qua những dòng không cần đụng tới để
 * tìm dòng cần đụng, và trong lúc điều phối thì thứ bị cuộn qua là thứ bị quên.
 *
 * Trong mỗi nhóm vẫn giữ MỚI NHẤT LÊN ĐẦU, đúng như máy chủ đang trả về — đổi cả
 * hai chiều cùng lúc thì người quen mắt không còn tìm thấy gì ở chỗ cũ.
 *
 * Không sửa tại chỗ: mảng đến từ React state, `sort` gốc là đột biến.
 */
export function sortByAttention<
  T extends Parameters<typeof waitingOnMe>[0] & { requestedAt: string },
>(loans: readonly T[]): T[] {
  return [...loans].sort((a, b) => {
    const mine = Number(waitingOnMe(b)) - Number(waitingOnMe(a));
    if (mine !== 0) return mine;
    return b.requestedAt.localeCompare(a.requestedAt);
  });
}
