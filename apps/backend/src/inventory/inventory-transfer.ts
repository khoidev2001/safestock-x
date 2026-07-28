import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { CirculationStatus, LoanStatus, Prisma, TransactionSource } from "@prisma/client";
import { TransactionType } from "@safestock/shared-types";
import { randomUUID } from "node:crypto";
import {
  lockLoanBatch,
  lockLoanTableForApproval,
} from "../loan/loan-table-lock";
import { sumOutstanding } from "./loan-math";
import { assertWarehouseInScope } from "./warehouse-scope";

type TransferInput = {
  userId: string;
  batchId: string;
  toShelfId: string;
  quantity: number;
  note?: string;
  scopeWarehouseId?: string | null;
};

export type TransferInTxResult = {
  result: {
    batch: Awaited<ReturnType<Prisma.TransactionClient["itemBatch"]["findUnique"]>>;
    transaction: Awaited<ReturnType<Prisma.TransactionClient["inventoryTransaction"]["create"]>>;
  };
  warehouseIds: string[];
};

export async function transferInventoryInTx(
  tx: Prisma.TransactionClient,
  input: TransferInput,
): Promise<TransferInTxResult> {
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
    throw new BadRequestException("Số lượng điều chuyển phải là số nguyên dương");
  }

  await lockLoanTableForApproval(tx);
  await lockLoanBatch(tx, input.batchId);

  const [actor, sourceBatch, destinationShelf] = await Promise.all([
    tx.user.findUnique({
      where: { id: input.userId },
      select: { organizationId: true },
    }),
    tx.itemBatch.findUnique({
      where: { id: input.batchId },
      include: {
        shelf: {
          select: {
            zone: {
              select: {
                warehouseId: true,
                warehouse: { select: { organizationId: true, communeId: true } },
              },
            },
          },
        },
        loans: {
          where: { status: { in: [LoanStatus.ON_LOAN, LoanStatus.PARTIALLY_RETURNED] } },
          select: { quantity: true, returnedOk: true, returnedDamaged: true, lost: true },
        },
      },
    }),
    tx.shelf.findUnique({
      where: { id: input.toShelfId },
      select: {
        id: true,
        isLocked: true,
        zone: {
          select: {
            warehouseId: true,
            warehouse: { select: { organizationId: true, communeId: true } },
          },
        },
      },
    }),
  ]);

  if (!actor) throw new NotFoundException("Không tìm thấy người thao tác");
  if (!sourceBatch) {
    assertWarehouseInScope(input.scopeWarehouseId, undefined);
    throw new NotFoundException("Không tìm thấy lô vật tư");
  }
  if (!destinationShelf) {
    assertWarehouseInScope(input.scopeWarehouseId, undefined);
    throw new NotFoundException("Kệ đích không tồn tại");
  }
  if (destinationShelf.isLocked) {
    throw new ConflictException("Kệ đích đang bị khóa");
  }

  const sourceWarehouseId = sourceBatch.shelf?.zone.warehouseId;
  const destinationWarehouseId = destinationShelf.zone.warehouseId;
  assertWarehouseInScope(input.scopeWarehouseId, sourceWarehouseId);
  const sourceWarehouse = sourceBatch.shelf?.zone.warehouse;
  const destinationWarehouse = destinationShelf.zone.warehouse;
  if (
    !sourceWarehouse ||
    sourceWarehouse.organizationId !== actor.organizationId ||
    destinationWarehouse.organizationId !== actor.organizationId ||
    sourceWarehouse.communeId !== destinationWarehouse.communeId
  ) {
    throw new ForbiddenException("Bạn chỉ được điều chuyển vật tư trong phạm vi xã của mình");
  }

  const outstandingLoan = sumOutstanding(sourceBatch.loans);
  if (outstandingLoan > 0 || sourceBatch.circulation === CirculationStatus.ON_LOAN) {
    throw new ConflictException("Lô vật tư đang có số lượng cho mượn chưa hoàn trả");
  }

  if (sourceBatch.shelfId === input.toShelfId) {
    throw new BadRequestException("Lô vật tư đã nằm trên kệ đích");
  }
  if (input.quantity > sourceBatch.quantity) {
    throw new BadRequestException(
      `Không đủ tồn để điều chuyển: hiện ${sourceBatch.quantity}, yêu cầu ${input.quantity}`,
    );
  }

  const scopeWhere = input.scopeWarehouseId
    ? { shelf: { zone: { warehouseId: input.scopeWarehouseId } } }
    : {};
  const isSplit = input.quantity < sourceBatch.quantity;
  let movedBatch;
  let sourceBeforeQuantity = sourceBatch.quantity;
  let sourceAfterQuantity: number;

  if (isSplit) {
    const claim = await tx.itemBatch.updateMany({
      where: {
        id: sourceBatch.id,
        shelfId: sourceBatch.shelfId,
        quantity: { gte: input.quantity },
        ...scopeWhere,
      },
      data: { quantity: { decrement: input.quantity } },
    });
    if (claim.count === 0) {
      await throwStaleTransfer(tx, input, sourceBatch.shelfId);
    }

    const sourceAfter = await tx.itemBatch.findUnique({ where: { id: sourceBatch.id } });
    if (!sourceAfter) throw new NotFoundException("Không tìm thấy lô vật tư");
    sourceAfterQuantity = sourceAfter.quantity;
    sourceBeforeQuantity = sourceAfter.quantity + input.quantity;
    movedBatch = await tx.itemBatch.create({
      data: {
        itemId: sourceBatch.itemId,
        shelfId: input.toShelfId,
        batchCode: `${sourceBatch.batchCode}-T-${randomUUID()}`,
        quantity: input.quantity,
        status: sourceBatch.status,
        condition: sourceBatch.condition,
        circulation: sourceBatch.circulation,
        expiryDate: sourceBatch.expiryDate,
        inspectedAt: sourceBatch.inspectedAt,
      },
    });
  } else {
    const claim = await tx.itemBatch.updateMany({
      where: {
        id: sourceBatch.id,
        shelfId: sourceBatch.shelfId,
        quantity: sourceBatch.quantity,
        ...scopeWhere,
      },
      data: { shelfId: input.toShelfId },
    });
    if (claim.count === 0) {
      await throwStaleTransfer(tx, input, sourceBatch.shelfId);
    }

    movedBatch = await tx.itemBatch.findUnique({ where: { id: sourceBatch.id } });
    if (!movedBatch) throw new NotFoundException("Không tìm thấy lô vật tư");
    sourceAfterQuantity = 0;
  }

  const transaction = await tx.inventoryTransaction.create({
    data: {
      batchId: movedBatch.id,
      userId: input.userId,
      type: TransactionType.TRANSFER,
      source: TransactionSource.MANUAL,
      quantity: input.quantity,
      beforeQuantity: isSplit ? 0 : sourceBatch.quantity,
      afterQuantity: isSplit ? input.quantity : sourceBatch.quantity,
      quantityDelta: isSplit ? input.quantity : 0,
      note: input.note,
      warehouseId: destinationWarehouseId,
      fromWarehouseId: sourceWarehouseId,
      toWarehouseId: destinationWarehouseId,
    },
  });
  await tx.auditLog.create({
    data: {
      actorId: input.userId,
      action: "INVENTORY_TRANSFER",
      entity: "ItemBatch",
      entityId: sourceBatch.id,
      metadata: {
        sourceBatchId: sourceBatch.id,
        destinationBatchId: movedBatch.id,
        fromShelfId: sourceBatch.shelfId,
        toShelfId: input.toShelfId,
        fromWarehouseId: sourceWarehouseId ?? null,
        toWarehouseId: destinationWarehouseId,
        quantity: input.quantity,
        before: {
          sourceQuantity: sourceBeforeQuantity,
          sourceShelfId: sourceBatch.shelfId,
        },
        after: {
          sourceQuantity: sourceAfterQuantity,
          destinationQuantity: input.quantity,
          destinationShelfId: input.toShelfId,
        },
        source: TransactionSource.MANUAL,
        note: input.note ?? null,
        split: isSplit,
      },
    },
  });

  return {
    result: { batch: movedBatch, transaction },
    warehouseIds: [sourceWarehouseId, destinationWarehouseId].filter(
      (warehouseId): warehouseId is string => Boolean(warehouseId),
    ),
  };
}

async function throwStaleTransfer(
  tx: Prisma.TransactionClient,
  input: TransferInput,
  expectedShelfId: string | null,
): Promise<never> {
  const current = await tx.itemBatch.findUnique({
    where: { id: input.batchId },
    include: { shelf: { select: { zone: { select: { warehouseId: true } } } } },
  });
  if (!current) throw new NotFoundException("Không tìm thấy lô vật tư");
  assertWarehouseInScope(input.scopeWarehouseId, current.shelf?.zone.warehouseId);

  if (current.shelfId === expectedShelfId && current.quantity < input.quantity) {
    throw new ConflictException("Tồn kho vừa thay đổi; hãy tải lại trước khi điều chuyển");
  }
  throw new ConflictException("Lô vật tư vừa được cập nhật; hãy tải lại trước khi điều chuyển");
}
