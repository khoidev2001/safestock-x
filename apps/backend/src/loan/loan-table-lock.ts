import { Prisma } from "@prisma/client";

type LoanTableLockClient = Pick<Prisma.TransactionClient, "$executeRawUnsafe">;

export function lockLoanTableForApproval(tx: LoanTableLockClient): Promise<number> {
  // Monthly approval may read many loans; block writers but keep ordinary reads available.
  return tx.$executeRawUnsafe('LOCK TABLE "LoanRecord" IN SHARE MODE');
}

export function lockLoanTableForMutation(tx: LoanTableLockClient): Promise<number> {
  // Acquire the DML lock before business reads so approval cannot split a loan snapshot.
  return tx.$executeRawUnsafe('LOCK TABLE "LoanRecord" IN ROW EXCLUSIVE MODE');
}
