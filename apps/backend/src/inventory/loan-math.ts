type LoanQuantities = Pick<
  import("@prisma/client").LoanRecord,
  "quantity" | "returnedOk" | "returnedDamaged" | "lost"
>;

/** Số còn nợ của một phiếu mượn = số mượn - đã hoàn (tốt + hỏng + mất). */
export function outstandingOf(loan: LoanQuantities): number {
  return loan.quantity - loan.returnedOk - loan.returnedDamaged - loan.lost;
}

/** Tổng số đang mượn từ danh sách phiếu, dùng chung cho inventory và loan. */
export function sumOutstanding(loans: readonly LoanQuantities[]): number {
  return loans.reduce((sum, loan) => sum + outstandingOf(loan), 0);
}
