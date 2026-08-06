export interface LoanLike {
  direction: "OUTGOING" | "INCOMING";
  status: string;
  itemSku: string;
  itemName: string;
  unit: string;
  quantity: number;
  returnedQuantity: number;
  peerCommuneName: string;
}

export interface StockMark {
  itemSku: string;
  itemName: string;
  unit: string;
  /** Đang cho xã khác mượn — đã rời kho, còn chờ nhận lại. */
  lentOut: number;
  /** Đang mượn của xã khác — đang nằm trong kho nhưng không phải của mình. */
  borrowedIn: number;
  /** Các xã liên quan, để nhìn là biết gọi ai. */
  peers: string[];
}

/**
 * Số hàng đang mắc nợ với xã khác, gom theo mã vật tư.
 *
 * TÍNH TỪ SỔ MƯỢN, không thêm cột vào lô vật tư. Hai lý do:
 *
 * 1. Một lô có thể vừa là hàng của mình vừa có phần đang mượn; gắn cờ lên lô thì
 *    phải tách lô ra, mà tách lô là đổi cách kho vận hành chỉ vì một cái nhãn.
 * 2. Suy từ sổ thì con số KHÔNG BAO GIỜ lệch với sổ. Nuôi thêm một cột song song
 *    là nuôi thêm một chỗ để sai, và cái sai đó chỉ lộ ra lúc đối chiếu cuối kỳ.
 *
 * Chỉ tính khoản CÒN MỞ và đã thật sự chuyển hàng: yêu cầu chưa duyệt thì chưa có
 * hàng nào rời chỗ, đưa vào là bịa ra một khoản nợ chưa tồn tại.
 */
export function stockMarksFromLoans(loans: LoanLike[]): StockMark[] {
  const theoSku = new Map<string, StockMark>();

  for (const loan of loans) {
    if (loan.status !== "ACTIVE" && loan.status !== "PARTIALLY_RETURNED") continue;
    const conNo = Math.max(0, loan.quantity - loan.returnedQuantity);
    if (conNo === 0) continue;

    const mark = theoSku.get(loan.itemSku) ?? {
      itemSku: loan.itemSku,
      itemName: loan.itemName,
      unit: loan.unit,
      lentOut: 0,
      borrowedIn: 0,
      peers: [],
    };
    if (loan.direction === "OUTGOING") mark.lentOut += conNo;
    else mark.borrowedIn += conNo;
    if (!mark.peers.includes(loan.peerCommuneName)) mark.peers.push(loan.peerCommuneName);
    theoSku.set(loan.itemSku, mark);
  }

  return [...theoSku.values()].sort((a, b) => a.itemName.localeCompare(b.itemName, "vi"));
}
