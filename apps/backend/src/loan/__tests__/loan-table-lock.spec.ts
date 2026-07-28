import { ForbiddenException } from "@nestjs/common";
import { LoanStatus } from "@prisma/client";
import { LoanService } from "../loan.service";

describe("LoanService loan-table coordination", () => {
  it("acquires the mutation lock before borrow reads inventory", async () => {
    const state = makeState();

    await state.service.borrow("user-1", "batch-1", 1);

    expect(state.tx.$executeRawUnsafe).toHaveBeenCalledWith(
      'LOCK TABLE "LoanRecord" IN ROW EXCLUSIVE MODE',
    );
    expect(state.tx.$executeRawUnsafe).toHaveBeenNthCalledWith(
      2,
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
      "loan-batch:batch-1",
    );
    expect(state.tx.$executeRawUnsafe.mock.invocationCallOrder[0]).toBeLessThan(
      state.tx.itemBatch.findUnique.mock.invocationCallOrder[0],
    );
    expect(state.tx.$executeRawUnsafe.mock.invocationCallOrder[1]).toBeLessThan(
      state.tx.itemBatch.findUnique.mock.invocationCallOrder[0],
    );
  });

  it("acquires the mutation lock before return reads the loan", async () => {
    const state = makeState();

    await state.service.returnItems("user-1", "loan-1", 1, 0, 0);

    expect(state.tx.$executeRawUnsafe).toHaveBeenCalledWith(
      'LOCK TABLE "LoanRecord" IN ROW EXCLUSIVE MODE',
    );
    expect(state.tx.$executeRawUnsafe).toHaveBeenNthCalledWith(
      2,
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
      "loan-batch:batch-1",
    );
    expect(state.tx.$executeRawUnsafe.mock.invocationCallOrder[0]).toBeLessThan(
      state.tx.loanRecord.findUnique.mock.invocationCallOrder[0],
    );
    expect(state.tx.$executeRawUnsafe.mock.invocationCallOrder[1]).toBeLessThan(
      state.tx.loanRecord.findUnique.mock.invocationCallOrder[1],
    );
  });

  it("blocks borrow outside assigned warehouse before mutation", async () => {
    const state = makeState();
    state.prisma.itemBatch.findUnique.mockResolvedValue({
      shelf: { zone: { warehouseId: "warehouse-foreign" } },
    });

    await expect(
      state.service.borrow("user-1", "batch-1", 1, undefined, "warehouse-owned"),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(state.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("blocks returning a foreign loan inside the transaction", async () => {
    const state = makeState();
    state.tx.itemBatch.findUnique.mockResolvedValue({
      shelf: { zone: { warehouseId: "warehouse-foreign" } },
    });

    await expect(
      state.service.returnItems("user-1", "loan-1", 1, 0, 0, "warehouse-owned"),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(state.tx.loanRecord.updateMany).not.toHaveBeenCalled();
  });

  it("blocks listing loans from another warehouse", async () => {
    const state = makeState();

    await expect(state.service.listOpen("warehouse-foreign", "warehouse-owned")).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});

function makeState() {
  const openLoan = {
    id: "loan-1",
    batchId: "batch-1",
    quantity: 2,
    borrowedByUserId: "user-1",
    missionId: null,
    status: LoanStatus.ON_LOAN,
    returnedOk: 0,
    returnedDamaged: 0,
    lost: 0,
    borrowedAt: new Date("2026-01-01"),
    closedAt: null,
  };
  const tx = {
    $executeRawUnsafe: jest.fn().mockResolvedValue(0),
    itemBatch: {
      findUnique: jest.fn().mockResolvedValue({
        id: "batch-1",
        quantity: 5,
        status: "AVAILABLE",
        condition: "NEW",
        expiryDate: null,
        shelf: { isLocked: false },
        item: { consumable: false },
      }),
      update: jest.fn().mockResolvedValue({ id: "batch-1" }),
    },
    loanRecord: {
      findUnique: jest.fn().mockResolvedValue(openLoan),
      findMany: jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          { ...openLoan, returnedOk: 1, status: LoanStatus.PARTIALLY_RETURNED },
        ]),
      create: jest.fn().mockResolvedValue(openLoan),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    inventoryTransaction: {
      create: jest.fn().mockResolvedValue({ id: "txn-return-1" }),
    },
    auditLog: { create: jest.fn().mockResolvedValue({ id: "audit-1" }) },
  };
  const prisma = {
    $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    // recalcAfterLoanTxn đọc lô sau commit; trả lô không gắn kho → bỏ qua recalc.
    itemBatch: { findUnique: jest.fn().mockResolvedValue({ shelf: null }) },
  };
  const readiness = { recalculateWarehouse: jest.fn().mockResolvedValue(undefined) };
  const service = new LoanService(prisma as never, readiness as never);
  return { service, prisma, tx, readiness };
}
