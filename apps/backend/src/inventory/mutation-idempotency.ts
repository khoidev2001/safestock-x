import { ConflictException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { createHash } from "node:crypto";

type IdempotencyClient = Pick<Prisma.TransactionClient, "$executeRawUnsafe" | "auditLog">;

type IdempotencyOptions = {
  actorId: string;
  operation: string;
  requestId?: string;
  fingerprint?: string;
};

const RECEIPT_ACTION = "MUTATION_RECEIPT";

/**
 * Serializes retries for one actor/operation/request ID and stores the committed
 * response in AuditLog. The receipt is written in the caller's transaction, so a
 * rollback never leaves a false-success receipt.
 */
export async function withMutationIdempotency<T>(
  tx: IdempotencyClient,
  options: IdempotencyOptions,
  mutate: () => Promise<T>,
): Promise<T> {
  if (!options.requestId) return mutate();

  const lockKey = `${options.actorId}:${options.operation}:${options.requestId}`;
  await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", lockKey);

  const receipt = await tx.auditLog.findFirst({
    where: {
      actorId: options.actorId,
      action: RECEIPT_ACTION,
      entity: options.operation,
      entityId: options.requestId,
    },
    orderBy: { createdAt: "desc" },
  });
  const replay = readReceiptResponse<T>(receipt?.metadata);
  if (replay.found) {
    if (options.fingerprint && options.fingerprint !== replay.fingerprint) {
      throw new ConflictException(
        replay.fingerprint
          ? "Mã yêu cầu đã được dùng cho một thao tác có dữ liệu khác"
          : "Mã yêu cầu cũ không có dấu vân tay dữ liệu; hãy tải lại biểu mẫu",
      );
    }
    return replay.response;
  }

  const response = await mutate();
  await tx.auditLog.create({
    data: {
      actorId: options.actorId,
      action: RECEIPT_ACTION,
      entity: options.operation,
      entityId: options.requestId,
      metadata: {
        requestId: options.requestId,
        operation: options.operation,
        ...(options.fingerprint ? { fingerprint: options.fingerprint } : {}),
        response: toJson(response),
      },
    },
  });
  return response;
}

function readReceiptResponse<T>(
  metadata: Prisma.JsonValue | null | undefined,
): { found: false } | { found: true; response: T; fingerprint?: string } {
  if (!metadata || Array.isArray(metadata) || typeof metadata !== "object") {
    return { found: false };
  }
  if (!Object.prototype.hasOwnProperty.call(metadata, "response")) {
    return { found: false };
  }
  return {
    found: true,
    response: metadata.response as T,
    fingerprint: typeof metadata.fingerprint === "string" ? metadata.fingerprint : undefined,
  };
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

/** Produces a stable, non-sensitive digest for an idempotent mutation payload. */
export function mutationFingerprint(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(sortForFingerprint(value)))
    .digest("hex");
}

function sortForFingerprint(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(sortForFingerprint);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, sortForFingerprint(nested)]),
    );
  }
  return value;
}
