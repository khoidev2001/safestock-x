import { BadRequestException, ConflictException } from "@nestjs/common";
import { LoanStatus } from "@prisma/client";
import { InventoryAdjustmentService } from "../inventory-adjustment.service";
import { InventoryService } from "../inventory.service";
import { LoanService } from "../../loan/loan.service";

describe("inventory and loan physical-stock integrity", () => {
  it("rejects export that would consume units currently on loan", async () => {
    const state = makeInventoryState({ quantity: 10, outstandingLoan: 8 });
    const service = new InventoryService(state.prisma as never, state.readiness as never);

    await expect(service.export("user-1", "batch-1", 5)).rejects.toBeInstanceOf(
      BadRequestException,
    );

    expect(state.quantity()).toBe(10);
    expect(state.transactions).toHaveLength(0);
  });

  it("serializes condition changes with export on the same batch", async () => {
    const state = makeInventoryState({ quantity: 10, outstandingLoan: 0 });
    const service = new InventoryService(state.prisma as never, state.readiness as never);

    await service.export("user-1", "batch-1", 1);

    expect(state.lockStatements()).toEqual([
      'LOCK TABLE "LoanRecord" IN SHARE MODE',
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
    ]);
  });

  it("rejects a manual adjustment below the outstanding loan quantity", async () => {
    const state = makeInventoryState({ quantity: 10, outstandingLoan: 8 });
    const service = new InventoryAdjustmentService(state.prisma as never, state.readiness as never);

    await expect(service.adjust("user-1", "batch-1", 7, "Đối chiếu tay")).rejects.toBeInstanceOf(
      ConflictException,
    );

    expect(state.quantity()).toBe(10);
    expect(state.transactions).toHaveLength(0);
  });

  it("does not export twice when the client retries the same request ID", async () => {
    const state = makeInventoryState({ quantity: 10, outstandingLoan: 0 });
    const service = new InventoryService(state.prisma as never, state.readiness as never);

    const first = await service.export(
      "user-1",
      "batch-1",
      3,
      undefined,
      undefined,
      undefined,
      "export-request-123",
    );
    const retry = await service.export(
      "user-1",
      "batch-1",
      3,
      undefined,
      undefined,
      undefined,
      "export-request-123",
    );

    expect(retry).toEqual(first);
    expect(state.quantity()).toBe(7);
    expect(state.transactions).toHaveLength(1);
  });

  it("splits damaged returns into a NEEDS_CHECK batch without losing good stock", async () => {
    const state = makeLoanState({ batchQuantity: 10, loanQuantity: 4 });
    const service = new LoanService(state.prisma as never, state.readiness as never);

    await service.returnItems("user-1", "loan-1", 2, 2, 0);

    expect(state.sourceBatch()).toEqual(
      expect.objectContaining({
        quantity: 8,
        condition: "USED",
        circulation: "IN_STOCK",
      }),
    );
    expect(state.createdBatches).toEqual([
      expect.objectContaining({
        itemId: "item-1",
        shelfId: "shelf-1",
        quantity: 2,
        condition: "NEEDS_CHECK",
        circulation: "IN_STOCK",
      }),
    ]);
  });

  it("rolls back a lost return instead of allowing physical stock to become negative", async () => {
    const state = makeLoanState({ batchQuantity: 1, loanQuantity: 3 });
    const service = new LoanService(state.prisma as never, state.readiness as never);

    await expect(service.returnItems("user-1", "loan-1", 0, 0, 2)).rejects.toBeInstanceOf(
      ConflictException,
    );

    expect(state.sourceBatch().quantity).toBe(1);
    expect(state.loan().lost).toBe(0);
  });
});

function makeInventoryState({
  quantity: initialQuantity,
  outstandingLoan,
}: {
  quantity: number;
  outstandingLoan: number;
}) {
  let quantity = initialQuantity;
  const transactions: Record<string, unknown>[] = [];
  const audits: Record<string, unknown>[] = [];
  const batch = () => ({
    id: "batch-1",
    itemId: "item-1",
    shelfId: "shelf-1",
    quantity,
    circulation: outstandingLoan > 0 ? "ON_LOAN" : "IN_STOCK",
  });
  const tx = {
    $executeRawUnsafe: jest.fn().mockResolvedValue(0),
    itemBatch: {
      findUnique: jest.fn(async () => ({ ...batch() })),
      updateMany: jest.fn(
        async ({
          where,
          data,
        }: {
          where: { quantity?: { gte: number } };
          data: { quantity?: { decrement?: number }; condition?: string };
        }) => {
          if (where.quantity?.gte != null && quantity < where.quantity.gte) return { count: 0 };
          if (data.quantity?.decrement) quantity -= data.quantity.decrement;
          return { count: 1 };
        },
      ),
      update: jest.fn(async ({ data }: { data: { quantity?: number; condition?: string } }) => {
        if (typeof data.quantity === "number") quantity = data.quantity;
        return { ...batch(), ...data };
      }),
    },
    loanRecord: {
      findMany: jest.fn().mockResolvedValue(
        outstandingLoan > 0
          ? [
              {
                quantity: outstandingLoan,
                returnedOk: 0,
                returnedDamaged: 0,
                lost: 0,
              },
            ]
          : [],
      ),
    },
    inventoryTransaction: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const created = { id: `txn-${transactions.length + 1}`, ...data };
        transactions.push(created);
        return created;
      }),
    },
    auditLog: {
      findFirst: jest.fn(
        async ({ where }: { where: { action: string; entity: string; entityId: string } }) =>
          audits.find(
            (audit) =>
              audit.action === where.action &&
              audit.entity === where.entity &&
              audit.entityId === where.entityId,
          ) ?? null,
      ),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const created = { id: `audit-${audits.length + 1}`, ...data };
        audits.push(created);
        return created;
      }),
    },
  };
  const prisma = {
    $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<unknown>) => {
      const beforeQuantity = quantity;
      const transactionCount = transactions.length;
      const auditCount = audits.length;
      try {
        return await callback(tx);
      } catch (error) {
        quantity = beforeQuantity;
        transactions.splice(transactionCount);
        audits.splice(auditCount);
        throw error;
      }
    }),
    itemBatch: {
      findUnique: jest.fn().mockResolvedValue({
        shelf: { zone: { warehouseId: "warehouse-1" } },
      }),
    },
  };
  return {
    prisma,
    readiness: { recalculateWarehouse: jest.fn().mockResolvedValue(undefined) },
    quantity: () => quantity,
    transactions,
    lockStatements: () => tx.$executeRawUnsafe.mock.calls.map(([statement]) => statement as string),
  };
}

function makeLoanState({
  batchQuantity,
  loanQuantity,
}: {
  batchQuantity: number;
  loanQuantity: number;
}) {
  let sourceBatch = {
    id: "batch-1",
    itemId: "item-1",
    shelfId: "shelf-1",
    batchCode: "LOT-1",
    quantity: batchQuantity,
    condition: "NEW",
    circulation: "ON_LOAN",
    status: "AVAILABLE",
    expiryDate: null,
    inspectedAt: null,
  };
  let loan: {
    id: string;
    batchId: string;
    quantity: number;
    returnedOk: number;
    returnedDamaged: number;
    lost: number;
    status: LoanStatus;
  } = {
    id: "loan-1",
    batchId: "batch-1",
    quantity: loanQuantity,
    returnedOk: 0,
    returnedDamaged: 0,
    lost: 0,
    status: LoanStatus.ON_LOAN,
  };
  const createdBatches: Record<string, unknown>[] = [];
  const tx = {
    $executeRawUnsafe: jest.fn().mockResolvedValue(0),
    loanRecord: {
      findUnique: jest.fn(async () => ({ ...loan })),
      findMany: jest.fn(async () => (loan.status === LoanStatus.CLOSED ? [] : [{ ...loan }])),
      updateMany: jest.fn(
        async ({
          where,
          data,
        }: {
          where: {
            returnedOk: number;
            returnedDamaged: number;
            lost: number;
            status: LoanStatus;
          };
          data: {
            returnedOk: number;
            returnedDamaged: number;
            lost: number;
            status: LoanStatus;
          };
        }) => {
          if (
            loan.returnedOk !== where.returnedOk ||
            loan.returnedDamaged !== where.returnedDamaged ||
            loan.lost !== where.lost ||
            loan.status !== where.status
          ) {
            return { count: 0 };
          }
          loan = { ...loan, ...data };
          return { count: 1 };
        },
      ),
    },
    itemBatch: {
      findUnique: jest.fn(async () => ({ ...sourceBatch })),
      update: jest.fn(
        async ({
          data,
        }: {
          data: {
            quantity?: { decrement: number };
            condition?: string;
            circulation?: string;
          };
        }) => {
          if (data.quantity) sourceBatch.quantity -= data.quantity.decrement;
          sourceBatch = { ...sourceBatch, ...data, quantity: sourceBatch.quantity };
          return { ...sourceBatch };
        },
      ),
      updateMany: jest.fn(
        async ({
          where,
          data,
        }: {
          where: { quantity: { gte: number } };
          data: { quantity: { decrement: number } };
        }) => {
          if (sourceBatch.quantity < where.quantity.gte) return { count: 0 };
          sourceBatch.quantity -= data.quantity.decrement;
          return { count: 1 };
        },
      ),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        createdBatches.push(data);
        return { id: `batch-return-${createdBatches.length}`, ...data };
      }),
    },
    inventoryTransaction: {
      create: jest.fn().mockResolvedValue({ id: "txn-return-1" }),
    },
    auditLog: { create: jest.fn().mockResolvedValue({ id: "audit-1" }) },
  };
  const prisma = {
    $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<unknown>) => {
      const batchSnapshot = structuredClone(sourceBatch);
      const loanSnapshot = structuredClone(loan);
      const createdCount = createdBatches.length;
      try {
        return await callback(tx);
      } catch (error) {
        sourceBatch = batchSnapshot;
        loan = loanSnapshot;
        createdBatches.splice(createdCount);
        throw error;
      }
    }),
    itemBatch: {
      findUnique: jest.fn().mockResolvedValue({
        shelf: { zone: { warehouseId: "warehouse-1" } },
      }),
    },
  };
  return {
    prisma,
    readiness: { recalculateWarehouse: jest.fn().mockResolvedValue(undefined) },
    sourceBatch: () => sourceBatch,
    loan: () => loan,
    createdBatches,
  };
}
