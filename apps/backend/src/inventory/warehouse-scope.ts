import { ForbiddenException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Chặn IDOR theo scope kho (đẳng cấp — chặn Ở SERVICE LAYER, không chỉ ẩn UI).
 * scopeWarehouseId null = user quản toàn xã → cho qua mọi kho.
 * Có giá trị (trưởng thôn) = batch PHẢI thuộc đúng kho đó, nếu không → 403.
 */
export async function assertBatchInScope(
  prisma: PrismaService,
  scopeWarehouseId: string | null | undefined,
  batchId: string,
): Promise<void> {
  if (!scopeWarehouseId) return; // toàn xã — không giới hạn
  const batch = await prisma.itemBatch.findUnique({
    where: { id: batchId },
    select: { shelf: { select: { zone: { select: { warehouseId: true } } } } },
  });
  const owner = batch?.shelf?.zone.warehouseId;
  if (owner !== scopeWarehouseId) {
    throw new ForbiddenException("Bạn chỉ được thao tác trên kho thôn được phân công");
  }
}
