import { ForbiddenException } from "@nestjs/common";
import { Prisma } from "@prisma/client";

type BatchScopeClient = Pick<Prisma.TransactionClient, "itemBatch">;

const WAREHOUSE_SCOPE_ERROR = "Bạn chỉ được thao tác trên kho thôn được phân công";

export function assertWarehouseInScope(
  scopeWarehouseId: string | null | undefined,
  ownerWarehouseId: string | null | undefined,
): void {
  if (scopeWarehouseId && ownerWarehouseId !== scopeWarehouseId) {
    throw new ForbiddenException(WAREHOUSE_SCOPE_ERROR);
  }
}

/**
 * Chặn IDOR theo scope kho (đẳng cấp — chặn Ở SERVICE LAYER, không chỉ ẩn UI).
 * scopeWarehouseId null = user quản toàn xã → cho qua mọi kho.
 * Có giá trị (trưởng thôn) = batch PHẢI thuộc đúng kho đó, nếu không → 403.
 */
export async function assertBatchInScope(
  prisma: BatchScopeClient,
  scopeWarehouseId: string | null | undefined,
  batchId: string,
): Promise<void> {
  if (!scopeWarehouseId) return; // toàn xã — không giới hạn
  const batch = await prisma.itemBatch.findUnique({
    where: { id: batchId },
    select: { shelf: { select: { zone: { select: { warehouseId: true } } } } },
  });
  const owner = batch?.shelf?.zone.warehouseId;
  assertWarehouseInScope(scopeWarehouseId, owner);
}
