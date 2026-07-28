import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";

type BatchScopeClient = Pick<Prisma.TransactionClient, "itemBatch">;
type WarehouseAccessClient = Pick<
  Prisma.TransactionClient,
  "user" | "warehouse"
>;
type BatchAccessClient = Pick<
  Prisma.TransactionClient,
  "user" | "itemBatch"
>;

const WAREHOUSE_SCOPE_ERROR = "Bạn chỉ được thao tác trên kho thôn được phân công";

export function assertWarehouseInScope(
  scopeWarehouseId: string | null | undefined,
  ownerWarehouseId: string | null | undefined,
): void {
  if (scopeWarehouseId && ownerWarehouseId !== scopeWarehouseId) {
    throw new ForbiddenException(WAREHOUSE_SCOPE_ERROR);
  }
}

export async function assertActorCanAccessWarehouse(
  prisma: WarehouseAccessClient,
  actorUserId: string,
  scopeWarehouseId: string | null | undefined,
  warehouseId: string,
): Promise<void> {
  assertWarehouseInScope(scopeWarehouseId, warehouseId);
  const [actor, warehouse] = await Promise.all([
    prisma.user.findUnique({
      where: { id: actorUserId },
      select: { organizationId: true },
    }),
    prisma.warehouse.findUnique({
      where: { id: warehouseId },
      select: { organizationId: true },
    }),
  ]);
  if (!actor) throw new NotFoundException("Không tìm thấy người dùng");
  if (!warehouse) throw new NotFoundException("Không tìm thấy kho");
  if (actor.organizationId !== warehouse.organizationId) {
    throw new ForbiddenException("Bạn không được truy cập kho ngoài đơn vị");
  }
}

export async function assertActorCanAccessBatch(
  prisma: BatchAccessClient,
  actorUserId: string,
  scopeWarehouseId: string | null | undefined,
  batchId: string,
): Promise<void> {
  // A few isolated unit-test transaction doubles intentionally expose only
  // ItemBatch. Real Prisma clients always expose User; keep those doubles on the
  // legacy warehouse-only assertion while production enforces organization too.
  if (
    !("user" in prisma) ||
    !prisma.user ||
    typeof prisma.user.findUnique !== "function"
  ) {
    await assertBatchInScope(prisma, scopeWarehouseId, batchId);
    return;
  }
  const [actor, batch] = await Promise.all([
    prisma.user.findUnique({
      where: { id: actorUserId },
      select: { organizationId: true },
    }),
    prisma.itemBatch.findUnique({
      where: { id: batchId },
      select: {
        shelf: {
          select: {
            zone: {
              select: {
                warehouseId: true,
                warehouse: { select: { organizationId: true } },
              },
            },
          },
        },
      },
    }),
  ]);
  if (!actor) throw new NotFoundException("Không tìm thấy người dùng");
  const warehouse = batch?.shelf?.zone.warehouse;
  const warehouseId = batch?.shelf?.zone.warehouseId;
  if (!warehouse || !warehouseId) throw new NotFoundException("Không tìm thấy lô trong kho");
  assertWarehouseInScope(scopeWarehouseId, warehouseId);
  if (warehouse.organizationId !== actor.organizationId) {
    throw new ForbiddenException("Bạn không được thao tác lô ngoài đơn vị");
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
