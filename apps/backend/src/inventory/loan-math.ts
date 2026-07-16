import { LoanRecord } from "@prisma/client";

/** Số còn nợ của 1 phiếu mượn = số mượn − đã hoàn (ok + hỏng + mất). */
export function outstandingOf(loan: LoanRecord): number {
  return loan.quantity - loan.returnedOk - loan.returnedDamaged - loan.lost;
}

/** Tổng số đang mượn từ danh sách phiếu (dùng chung inventory + loan). */
export function sumOutstanding(loans: LoanRecord[]): number {
  return loans.reduce((sum, loan) => sum + outstandingOf(loan), 0);
}
