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

export function lockLoanBatch(
  tx: LoanTableLockClient,
  batchId: string,
): Promise<number> {
  return tx.$executeRawUnsafe(
    "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
    `loan-batch:${batchId}`,
  );
}
