import { ConflictException } from "@nestjs/common";
import {
  mutationFingerprint,
  withMutationIdempotency,
} from "../mutation-idempotency";

describe("withMutationIdempotency", () => {
  it("replays the committed response and does not execute the mutation twice", async () => {
    const receipts: Record<string, unknown>[] = [];
    const tx = {
      $executeRawUnsafe: jest.fn().mockResolvedValue(0),
      auditLog: {
        findFirst: jest.fn(
          async ({ where }: { where: { entityId: string } }) =>
            receipts.find((receipt) => receipt.entityId === where.entityId) ?? null,
        ),
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          const receipt = { id: `receipt-${receipts.length + 1}`, ...data };
          receipts.push(receipt);
          return receipt;
        }),
      },
    };
    const mutate = jest.fn().mockResolvedValue({ transactionId: "txn-1", after: 7 });

    const first = await withMutationIdempotency(
      tx as never,
      {
        actorId: "user-1",
        operation: "inventory.export",
        requestId: "request-12345678",
        fingerprint: mutationFingerprint({ batchId: "batch-1", quantity: 3 }),
      },
      mutate,
    );
    const retry = await withMutationIdempotency(
      tx as never,
      {
        actorId: "user-1",
        operation: "inventory.export",
        requestId: "request-12345678",
        fingerprint: mutationFingerprint({ quantity: 3, batchId: "batch-1" }),
      },
      mutate,
    );

    expect(first).toEqual({ transactionId: "txn-1", after: 7 });
    expect(retry).toEqual(first);
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(tx.$executeRawUnsafe).toHaveBeenCalledTimes(2);
    expect(receipts).toHaveLength(1);
  });

  it("rejects reuse of one request ID for a different mutation payload", async () => {
    const receipts: Record<string, unknown>[] = [];
    const tx = {
      $executeRawUnsafe: jest.fn().mockResolvedValue(0),
      auditLog: {
        findFirst: jest.fn(
          async ({ where }: { where: { entityId: string } }) =>
            receipts.find((receipt) => receipt.entityId === where.entityId) ?? null,
        ),
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          const receipt = { id: `receipt-${receipts.length + 1}`, ...data };
          receipts.push(receipt);
          return receipt;
        }),
      },
    };
    const mutate = jest.fn().mockResolvedValue({ transactionId: "txn-1", after: 7 });

    await withMutationIdempotency(
      tx as never,
      {
        actorId: "user-1",
        operation: "inventory.export",
        requestId: "request-12345678",
        fingerprint: mutationFingerprint({ batchId: "batch-1", quantity: 3 }),
      },
      mutate,
    );

    await expect(
      withMutationIdempotency(
        tx as never,
        {
          actorId: "user-1",
          operation: "inventory.export",
          requestId: "request-12345678",
          fingerprint: mutationFingerprint({ batchId: "batch-2", quantity: 3 }),
        },
        mutate,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(receipts).toHaveLength(1);
  });

  it("creates the same fingerprint for objects with different key order", () => {
    expect(mutationFingerprint({ batchId: "batch-1", quantity: 3 })).toBe(
      mutationFingerprint({ quantity: 3, batchId: "batch-1" }),
    );
  });

  it("does not blindly replay a legacy receipt without a payload fingerprint", async () => {
    const tx = {
      $executeRawUnsafe: jest.fn().mockResolvedValue(0),
      auditLog: {
        findFirst: jest.fn().mockResolvedValue({
          metadata: { response: { transactionId: "legacy-txn" } },
        }),
        create: jest.fn(),
      },
    };

    await expect(
      withMutationIdempotency(
        tx as never,
        {
          actorId: "user-1",
          operation: "inventory.export",
          requestId: "legacy-request-123",
          fingerprint: mutationFingerprint({ batchId: "batch-1", quantity: 1 }),
        },
        jest.fn(),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
