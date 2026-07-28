import { LoanStatus } from "@prisma/client";
import { LoanService } from "../loan.service";

/**
 * Gap C: mượn/hoàn đổi onLoanQty của lô → "khả dụng ngay" đổi → điểm Readiness
 * PHẢI tính lại. Trước đây borrow/returnItems commit xong nhưng không recalc,
 * khiến điểm kho bị cũ. Test khẳng định recalc chạy đúng kho, SAU transaction,
 * và lỗi recalc không làm hỏng giao dịch (chỉ log).
 */
describe("LoanService — recalc Readiness sau mượn/hoàn (gap C)", () => {
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

  function makeState() {
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
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue(openLoan),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      inventoryTransaction: {
        create: jest.fn().mockResolvedValue({ id: "txn-return-1" }),
      },
      auditLog: { create: jest.fn().mockResolvedValue({ id: "audit-1" }) },
    };
    const prisma = {
      $transaction: jest.fn((cb: (client: typeof tx) => unknown) => cb(tx)),
      // recalcAfterLoanTxn tra kho chủ của lô sau commit.
      itemBatch: {
        findUnique: jest.fn().mockResolvedValue({ shelf: { zone: { warehouseId: "wh-1" } } }),
      },
    };
    const readiness = { recalculateWarehouse: jest.fn().mockResolvedValue(undefined) };
    const service = new LoanService(prisma as never, readiness as never);
    return { service, prisma, readiness };
  }

  it("borrow xong → recalc đúng kho chứa lô", async () => {
    const { service, prisma, readiness } = makeState();
    await service.borrow("user-1", "batch-1", 1);
    expect(prisma.itemBatch.findUnique).toHaveBeenCalledWith({
      where: { id: "batch-1" },
      select: { shelf: { select: { zone: { select: { warehouseId: true } } } } },
    });
    expect(readiness.recalculateWarehouse).toHaveBeenCalledWith("wh-1");
  });

  it("returnItems xong → recalc đúng kho, response KHÔNG lộ batchId nội bộ", async () => {
    const { service, readiness } = makeState();
    const res = await service.returnItems("user-1", "loan-1", 1, 0, 0);
    expect(readiness.recalculateWarehouse).toHaveBeenCalledWith("wh-1");
    // Contract trả về giữ nguyên như trước (không thêm batchId).
    expect(res).not.toHaveProperty("batchId");
    expect(res).toMatchObject({ loanId: "loan-1", closed: false });
  });

  it("recalc lỗi → KHÔNG làm hỏng mượn (chỉ log, vẫn trả loan)", async () => {
    const { service, readiness } = makeState();
    readiness.recalculateWarehouse.mockRejectedValue(new Error("db down"));
    await expect(service.borrow("user-1", "batch-1", 1)).resolves.toMatchObject({ id: "loan-1" });
  });

  it("lô không gắn kho → bỏ qua recalc (không ném)", async () => {
    const { service, prisma, readiness } = makeState();
    prisma.itemBatch.findUnique.mockResolvedValue({ shelf: null });
    await service.borrow("user-1", "batch-1", 1);
    expect(readiness.recalculateWarehouse).not.toHaveBeenCalled();
  });
});
