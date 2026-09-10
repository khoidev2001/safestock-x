/**
 * Một khoản mượn liên xã đang ở bước nào — và nói câu gì cho người điều phối.
 *
 * Tách khỏi giao diện vì đây là phần dễ sai nhất và cũng là phần đắt nhất khi
 * sai. Ba lỗi đã xảy ra thật, cả ba đều là lỗi ĐỌC trạng thái chứ không phải lỗi
 * dữ liệu:
 *
 * 1. Vừa bấm gửi đã hiện đỏ "xã kia CHƯA nhận được yêu cầu", vài giây sau tự đổi
 *    thành "chờ xã kia đồng ý". Vì màn hình suy trạng thái gửi từ chỗ `peerLoanId`
 *    còn rỗng, mà rỗng thì vừa nghĩa là "đang trên đường" vừa nghĩa là "hỏng".
 * 2. Xã kia đã đồng ý nhưng dòng chữ ghi "mượn thành công", trong khi vật tư vẫn
 *    ghi thiếu 5 chiếc — vì đồng ý mới là lời hứa, hàng chưa rời kho họ.
 * 3. Hỏi ba xã thì ba dòng trạng thái xếp lẫn lộn, không thứ tự, mỗi dòng một màu.
 *
 * Nguyên tắc chung của cả tệp: KHÔNG dùng một câu cho hai tình huống khác nhau,
 * và luôn nói ra bước kế tiếp thuộc về ai — mình, hay xã bên kia.
 */

export interface LoanLike {
  id: string;
  direction: "OUTGOING" | "INCOMING";
  status:
    | "REQUESTED"
    | "REJECTED"
    | "APPROVED"
    | "ACTIVE"
    | "PARTIALLY_RETURNED"
    | "RETURNED"
    | "CANCELLED";
  peerCommuneName: string;
  peerLoanId: string | null;
  peerDeliveryError: string | null;
  rejectReason: string | null;
  itemSku: string;
  unit: string;
  quantity: number;
}

/**
 * Bước của một lần hỏi mượn MỘT xã.
 *
 * Cố ý tách `SENDING` khỏi `UNDELIVERED`: đó chính là chỗ lỗi (1) nằm. Và tách
 * `PEER_AGREED` khỏi `RECEIVED`: đó là chỗ lỗi (2) nằm — xã kia đồng ý không có
 * nghĩa là kho mình đã có hàng.
 */
export type LoanStage =
  | "SENDING"
  | "UNDELIVERED"
  | "AWAITING_PEER"
  | "PEER_AGREED"
  | "RECEIVED"
  | "REJECTED"
  | "CANCELLED";

export type LoanTone = "ready" | "attention" | "critical" | "muted";

export function loanStage(loan: LoanLike): LoanStage {
  if (loan.status === "CANCELLED") return "CANCELLED";
  if (loan.status === "REJECTED") return "REJECTED";
  if (loan.status === "ACTIVE" || loan.status === "PARTIALLY_RETURNED") return "RECEIVED";
  if (loan.status === "RETURNED") return "RECEIVED";
  if (loan.status === "APPROVED") return "PEER_AGREED";
  // Còn lại là REQUESTED: bước nằm ở ĐƯỜNG TRUYỀN, không ở sổ.
  if (loan.peerLoanId) return "AWAITING_PEER";
  if (loan.peerDeliveryError) return "UNDELIVERED";
  return "SENDING";
}

/**
 * Thứ tự hiện trên màn hình: việc CỦA MÌNH trước, việc đang chờ người khác sau,
 * việc đã xong và đã đóng xuống cuối.
 *
 * Không sắp thì ba lần hỏi ba xã hiện ra theo thứ tự cơ sở dữ liệu trả về, và
 * dòng cần bấm ngay có thể nằm dưới cùng, dưới cả một dòng đã bị từ chối.
 */
const STAGE_ORDER: Record<LoanStage, number> = {
  UNDELIVERED: 0,
  PEER_AGREED: 1,
  SENDING: 2,
  AWAITING_PEER: 3,
  RECEIVED: 4,
  REJECTED: 5,
  CANCELLED: 6,
};

export function sortByStage<T extends LoanLike>(loans: T[]): T[] {
  return [...loans].sort((a, b) => STAGE_ORDER[loanStage(a)] - STAGE_ORDER[loanStage(b)]);
}

export interface LoanLine {
  text: string;
  tone: LoanTone;
  /** Nút cần bày kèm dòng này, nếu bước kế tiếp thuộc về người đang đọc. */
  action?: "RESEND" | "CONFIRM_RECEIVED";
}

/** Câu mô tả một lần hỏi mượn, kèm nút nếu bước kế tiếp là việc của mình. */
export function loanLine(loan: LoanLike): LoanLine {
  const amount = `${loan.quantity.toLocaleString("vi")} ${loan.unit}`;
  const commune = `xã ${loan.peerCommuneName}`;
  switch (loanStage(loan)) {
    case "SENDING":
      // KHÔNG tô đỏ và KHÔNG bày nút gửi lại: chưa có gì hỏng cả, chỉ là tin đang
      // đi. Đây đúng là chỗ mà bản cũ hét lên "xã kia CHƯA nhận được".
      return { text: `Đang gửi yêu cầu mượn ${amount} sang ${commune}…`, tone: "muted" };
    case "UNDELIVERED":
      return {
        text: `Chưa gửi được sang ${commune} — họ chưa nhận được yêu cầu mượn ${amount}. Gọi điện báo, hoặc bấm gửi lại.`,
        tone: "critical",
        action: "RESEND",
      };
    case "AWAITING_PEER":
      return {
        text: `${commune} đã nhận được yêu cầu mượn ${amount} — đang chờ họ trả lời.`,
        tone: "attention",
      };
    case "PEER_AGREED":
      // Vế sau là toàn bộ lý do tách bước này ra: đồng ý xong mà không ai bấm
      // nhận thì hàng vẫn nằm bên họ, và bảng vật tư vẫn ghi thiếu — đúng cảnh
      // "báo mượn thành công nhưng vẫn thiếu 5 chiếc".
      return {
        text: `${commune} ĐÃ ĐỒNG Ý cho mượn ${amount}. Hàng chưa về kho — bấm xác nhận đã nhận để cộng vào kho.`,
        tone: "attention",
        action: "CONFIRM_RECEIVED",
      };
    case "RECEIVED":
      return { text: `Đã nhận ${amount} từ ${commune}, đã cộng vào kho.`, tone: "ready" };
    case "REJECTED":
      return {
        text: `${commune} từ chối cho mượn${loan.rejectReason ? `: ${loan.rejectReason}` : ""}.`,
        tone: "muted",
      };
    case "CANCELLED":
      return { text: `Đã huỷ yêu cầu mượn ${amount} của ${commune}.`, tone: "muted" };
  }
}

/**
 * Một câu tóm tắt cho cả loại vật tư, khi đã hỏi từ hai xã trở lên.
 *
 * Ba dòng trạng thái xếp cạnh nhau đọc được, nhưng phải đọc hết ba mới biết
 * chuyện gì đang xảy ra. Câu này trả lời ngay: đã hỏi mấy xã, còn chờ ai, có ai
 * đồng ý chưa. Một lần hỏi thì không cần — dòng của chính nó đã nói đủ.
 */
export function attemptsSummary(loans: LoanLike[]): string | null {
  if (loans.length < 2) return null;
  const count = (stage: LoanStage) => loans.filter((loan) => loanStage(loan) === stage).length;
  const parts: string[] = [];
  const received = count("RECEIVED");
  const agreed = count("PEER_AGREED");
  const waiting = count("AWAITING_PEER") + count("SENDING");
  const undelivered = count("UNDELIVERED");
  const refused = count("REJECTED");
  if (received > 0) parts.push(`${received} xã đã giao hàng`);
  if (agreed > 0) parts.push(`${agreed} xã đã đồng ý, chờ nhận hàng`);
  if (waiting > 0) parts.push(`${waiting} xã đang chờ trả lời`);
  if (undelivered > 0) parts.push(`${undelivered} xã chưa nhận được yêu cầu`);
  if (refused > 0) parts.push(`${refused} xã từ chối`);
  if (parts.length === 0) return null;
  return `Đã hỏi ${loans.length} xã: ${parts.join(" · ")}.`;
}

/**
 * Còn bước nào phải chờ hay phải làm không — dùng để quyết định có hỏi lại máy
 * chủ theo chu kỳ hay không.
 *
 * Hết việc thì thôi hỏi: nuôi một vòng lặp gọi mạng chạy suốt ca trực cho những
 * khoản đã đóng sổ là tốn pin máy người trực để không đổi lấy gì.
 */
export function isLoanInFlight(loan: LoanLike): boolean {
  const stage = loanStage(loan);
  return stage === "SENDING" || stage === "AWAITING_PEER" || stage === "PEER_AGREED";
}
