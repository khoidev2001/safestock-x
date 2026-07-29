import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import {
  ItemCondition,
  ItemStatus,
  LoanStatus,
  Prisma,
  TransactionSource,
} from "@prisma/client";
import { TransactionType } from "@safestock/shared-types";
import { PrismaService } from "../prisma/prisma.service";
import { ReadinessService } from "../readiness/readiness.service";
import {
  lockLoanBatch,
  lockLoanTableForApproval,
} from "../loan/loan-table-lock";
import { sumOutstanding } from "./loan-math";
import { transferInventoryInTx } from "./inventory-transfer";
import {
  mutationFingerprint,
  withMutationIdempotency,
} from "./mutation-idempotency";
import {
  assertActorCanAccessWarehouse,
  assertActorCanAccessBatch,
  assertBatchInScope,
  assertWarehouseInScope,
} from "./warehouse-scope";

export type ReceiveBatchInput = {
  itemId?: string;
  newItem?: {
    sku: string;
    name: string;
    consumable: boolean;
    categoryId?: string;
    categoryName?: string;
    unit?: string;
  };
  shelfId: string;
  batchCode: string;
  quantity: number;
  expiryDate?: Date | null;
  condition?: ItemCondition;
  note?: string;
};

@Injectable()
export class InventoryService {
  private readonly log = new Logger(InventoryService.name);

  constructor(
    private prisma: PrismaService,
    private readiness: ReadinessService,
  ) {}

  /** Tính lại Readiness của kho chứa batch sau giao dịch đổi số lượng (C1). Không chặn response nếu lỗi. */
  private async recalcAfterTxn(batchId: string): Promise<void> {
    const batch = await this.prisma.itemBatch.findUnique({
      where: { id: batchId },
      select: { shelf: { select: { zone: { select: { warehouseId: true } } } } },
    });
    const warehouseId = batch?.shelf?.zone.warehouseId;
    if (!warehouseId) return;
    await this.readiness.recalculateWarehouse(warehouseId).catch((error) => {
      this.log.warn(`Recalc readiness sau giao dịch lỗi (batch ${batchId}): ${error.message}`);
    });
  }

  // Cây kho: warehouse → zones → shelves (+ số batch mỗi shelf)
  async tree(
    warehouseId: string,
    scopeWarehouseId?: string | null,
    actorUserId?: string,
  ) {
    if (actorUserId) {
      await assertActorCanAccessWarehouse(
        this.prisma,
        actorUserId,
        scopeWarehouseId,
        warehouseId,
      );
    } else {
      assertWarehouseInScope(scopeWarehouseId, warehouseId);
    }
    const wh = await this.prisma.warehouse.findUnique({
      where: { id: warehouseId },
      include: {
        zones: {
          include: {
            shelves: { include: { _count: { select: { batches: true } } } },
          },
        },
      },
    });
    if (!wh) throw new NotFoundException("Không tìm thấy kho");
    return wh;
  }

  async listBatches(
    warehouseId: string,
    scopeWarehouseId?: string | null,
    actorUserId?: string,
  ) {
    if (actorUserId) {
      await assertActorCanAccessWarehouse(
        this.prisma,
        actorUserId,
        scopeWarehouseId,
        warehouseId,
      );
    } else {
      assertWarehouseInScope(scopeWarehouseId, warehouseId);
    }
    return this.prisma.itemBatch.findMany({
      where: { shelf: { zone: { warehouseId } } },
      include: {
        item: { include: { category: true } },
        shelf: { include: { zone: true } },
        loans: {
          where: { status: { in: [LoanStatus.ON_LOAN, LoanStatus.PARTIALLY_RETURNED] } },
          select: { quantity: true, returnedOk: true, returnedDamaged: true, lost: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  // Scan QR: FE quét ra SKU → trả batch + vị trí + trạng thái
  async scanBySku(
    sku: string,
    scopeWarehouseId?: string | null,
    actorUserId?: string,
  ) {
    const actor = actorUserId
      ? await this.prisma.user.findUnique({
          where: { id: actorUserId },
          select: { organizationId: true },
        })
      : null;
    if (actorUserId && !actor) throw new NotFoundException("Không tìm thấy người dùng");
    const item = await this.prisma.item.findUnique({
      where: { sku },
      include: {
        category: true,
        batches: {
          where: scopeWarehouseId
            ? { shelf: { zone: { warehouseId: scopeWarehouseId } } }
            : actor
              ? {
                  shelf: {
                    zone: {
                      warehouse: { organizationId: actor.organizationId },
                    },
                  },
                }
              : undefined,
          include: { shelf: { include: { zone: true } } },
        },
      },
    });
    if (!item || ((scopeWarehouseId || actor) && item.batches.length === 0)) {
      throw new NotFoundException(`Không tìm thấy vật tư SKU=${sku} trong kho được phân công`);
    }
    return item;
  }

  async listTransactions(
    warehouseId: string,
    scopeWarehouseId: string | null | undefined,
    actorUserId: string,
    limit = 100,
  ) {
    await assertActorCanAccessWarehouse(
      this.prisma,
      actorUserId,
      scopeWarehouseId,
      warehouseId,
    );
    return this.prisma.inventoryTransaction.findMany({
      where: {
        OR: [
          { warehouseId },
          { fromWarehouseId: warehouseId },
          { toWarehouseId: warehouseId },
          {
            warehouseId: null,
            fromWarehouseId: null,
            toWarehouseId: null,
            batch: { shelf: { zone: { warehouseId } } },
          },
        ],
      },
      include: {
        batch: {
          select: {
            id: true,
            batchCode: true,
            item: { select: { sku: true, name: true } },
            shelf: {
              select: {
                code: true,
                zone: { select: { code: true, name: true } },
              },
            },
          },
        },
        user: { select: { fullName: true } },
      },
      orderBy: { createdAt: "desc" },
      take: Math.min(Math.max(limit, 1), 200),
    });
  }

  async listBatchesPage(
    warehouseId: string,
    scopeWarehouseId: string | null | undefined,
    actorUserId: string,
    cursor?: string,
    limit = 100,
  ) {
    await assertActorCanAccessWarehouse(
      this.prisma,
      actorUserId,
      scopeWarehouseId,
      warehouseId,
    );
    const pageSize = Math.min(Math.max(limit, 1), 200);
    if (cursor) {
      const scopedCursor = await this.prisma.itemBatch.findFirst({
        where: {
          id: cursor,
          shelf: { zone: { warehouseId } },
        },
        select: { id: true },
      });
      if (!scopedCursor) {
        throw new BadRequestException("Cursor tồn kho không hợp lệ cho kho này");
      }
    }
    const rows = await this.prisma.itemBatch.findMany({
      where: { shelf: { zone: { warehouseId } } },
      include: {
        item: { include: { category: true } },
        shelf: { include: { zone: true } },
        loans: {
          where: {
            status: {
              in: [LoanStatus.ON_LOAN, LoanStatus.PARTIALLY_RETURNED],
            },
          },
          select: {
            quantity: true,
            returnedOk: true,
            returnedDamaged: true,
            lost: true,
          },
        },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      take: pageSize + 1,
    });
    const hasMore = rows.length > pageSize;
    const data = hasMore ? rows.slice(0, pageSize) : rows;
    return {
      data,
      nextCursor: hasMore ? data[data.length - 1]?.id ?? null : null,
    };
  }

  async transferDestinations(
    sourceWarehouseId: string,
    scopeWarehouseId: string | null | undefined,
    actorUserId: string,
  ) {
    await assertActorCanAccessWarehouse(
      this.prisma,
      actorUserId,
      scopeWarehouseId,
      sourceWarehouseId,
    );
    const source = await this.prisma.warehouse.findUnique({
      where: { id: sourceWarehouseId },
      select: { organizationId: true, communeId: true },
    });
    if (!source) throw new NotFoundException("Không tìm thấy kho nguồn");

    return this.prisma.warehouse.findMany({
      where: {
        organizationId: source.organizationId,
        communeId: source.communeId,
      },
      select: {
        id: true,
        name: true,
        zones: {
          select: {
            id: true,
            code: true,
            name: true,
            shelves: {
              where: { isLocked: false },
              select: {
                id: true,
                code: true,
                isLocked: true,
              },
              orderBy: { code: "asc" },
            },
          },
          orderBy: { code: "asc" },
        },
      },
      orderBy: { name: "asc" },
    });
  }

  async listCatalog(actorUserId: string) {
    const actor = await this.prisma.user.findUnique({
      where: { id: actorUserId },
      select: { organizationId: true },
    });
    if (!actor) throw new NotFoundException("Không tìm thấy người thao tác");
    return this.prisma.item.findMany({
      where: {
        batches: {
          some: {
            shelf: {
              zone: {
                warehouse: { organizationId: actor.organizationId },
              },
            },
          },
        },
      },
      include: { category: true },
      orderBy: [{ category: { name: "asc" } }, { name: "asc" }],
    });
  }

  async receiveBatch(
    userId: string,
    input: ReceiveBatchInput,
    scopeWarehouseId?: string | null,
    requestId?: string,
  ) {
    const batchCode = input.batchCode.trim();
    if (!batchCode) throw new BadRequestException("Mã lô không được để trống");
    if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
      throw new BadRequestException("Số lượng nhập phải là số nguyên dương");
    }
    if (Boolean(input.itemId) === Boolean(input.newItem)) {
      throw new BadRequestException("Chọn một vật tư có sẵn hoặc khai báo vật tư mới");
    }
    if (input.expiryDate && Number.isNaN(input.expiryDate.getTime())) {
      throw new BadRequestException("Hạn dùng không hợp lệ");
    }
    if (input.expiryDate && isBeforeUtcToday(input.expiryDate)) {
      throw new BadRequestException("Không thể tiếp nhận lô đã hết hạn");
    }

    try {
      const result = await this.prisma.$transaction((tx) =>
        withMutationIdempotency(
          tx,
          {
            actorId: userId,
            operation: "inventory.receive-batch",
            requestId,
            fingerprint: mutationFingerprint(input),
          },
          async () => {
            const [actor, shelf] = await Promise.all([
              tx.user.findUnique({
                where: { id: userId },
                select: { organizationId: true },
              }),
              tx.shelf.findUnique({
                where: { id: input.shelfId },
                select: {
                  id: true,
                  isLocked: true,
                  zone: {
                    select: {
                      warehouseId: true,
                      warehouse: { select: { organizationId: true } },
                    },
                  },
                },
              }),
            ]);
            if (!actor) throw new NotFoundException("Không tìm thấy người thao tác");
            if (!shelf) throw new NotFoundException("Không tìm thấy kệ nhận hàng");
            assertWarehouseInScope(scopeWarehouseId, shelf.zone.warehouseId);
            if (shelf.zone.warehouse.organizationId !== actor.organizationId) {
              throw new ForbiddenException("Không được nhập hàng vào kho ngoài đơn vị");
            }
            if (shelf.isLocked) {
              throw new ConflictException("Kệ nhận hàng đang bị khóa");
            }

            let item;
            if (input.itemId) {
              const existingItem = await tx.item.findUnique({
                where: { id: input.itemId },
                include: {
                  batches: {
                    where: {
                      shelf: {
                        zone: {
                          warehouse: { organizationId: actor.organizationId },
                        },
                      },
                    },
                    select: { id: true },
                    take: 1,
                  },
                },
              });
              if (!existingItem) throw new NotFoundException("Không tìm thấy vật tư");
              if (existingItem.batches.length === 0) {
                throw new ForbiddenException("Không được dùng vật tư ngoài đơn vị");
              }
              item = existingItem;
            } else {
              item = await this.createCatalogItemInTx(tx, userId, input.newItem!);
            }

            const batch = await tx.itemBatch.create({
              data: {
                itemId: item.id,
                shelfId: shelf.id,
                batchCode,
                quantity: input.quantity,
                condition: input.condition ?? ItemCondition.NEW,
                expiryDate: input.expiryDate ?? null,
                inspectedAt: new Date(),
              },
            });
            const transaction = await tx.inventoryTransaction.create({
              data: {
                batchId: batch.id,
                userId,
                type: TransactionType.IMPORT,
                source: TransactionSource.MANUAL,
                quantity: input.quantity,
                beforeQuantity: 0,
                afterQuantity: input.quantity,
                quantityDelta: input.quantity,
                note: input.note,
                warehouseId: shelf.zone.warehouseId,
              },
            });
            await tx.auditLog.create({
              data: {
                actorId: userId,
                action: "INVENTORY_RECEIVE_BATCH",
                entity: "ItemBatch",
                entityId: batch.id,
                metadata: {
                  itemId: item.id,
                  sku: item.sku,
                  shelfId: shelf.id,
                  warehouseId: shelf.zone.warehouseId,
                  batchCode,
                  quantity: input.quantity,
                  expiryDate: input.expiryDate?.toISOString() ?? null,
                  condition: input.condition ?? ItemCondition.NEW,
                  transactionId: transaction.id,
                  note: input.note ?? null,
                },
              },
            });
            const receivedBatch = await tx.itemBatch.findUnique({
              where: { id: batch.id },
              include: {
                item: { include: { category: true } },
                shelf: { include: { zone: true } },
              },
            });
            if (!receivedBatch) {
              throw new NotFoundException("Không tìm thấy lô vừa tiếp nhận");
            }

            return {
              batch: receivedBatch,
              transaction,
              warehouseId: shelf.zone.warehouseId,
              qrPayload: `safestock://inventory?sku=${encodeURIComponent(item.sku)}&batch=${encodeURIComponent(batchCode)}`,
            };
          },
        ),
      );
      await this.readiness.recalculateWarehouse(result.warehouseId).catch((error) => {
        this.log.warn(`Recalc readiness sau tiếp nhận lô lỗi: ${error.message}`);
      });
      const { warehouseId: _warehouseId, ...response } = result;
      return response;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new ConflictException("SKU, danh mục hoặc mã lô đã tồn tại");
      }
      throw error;
    }
  }

  private async createCatalogItemInTx(
    tx: Prisma.TransactionClient,
    userId: string,
    input: NonNullable<ReceiveBatchInput["newItem"]>,
  ) {
    const sku = input.sku.trim().toUpperCase();
    const name = input.name.trim();
    if (!sku || !name) {
      throw new BadRequestException("SKU và tên vật tư không được để trống");
    }

    let category;
    if (input.categoryId) {
      category = await tx.itemCategory.findUnique({ where: { id: input.categoryId } });
      if (!category) throw new NotFoundException("Không tìm thấy danh mục");
    } else {
      const categoryName = input.categoryName?.trim();
      const unit = input.unit?.trim();
      if (!categoryName || !unit) {
        throw new BadRequestException("Vật tư mới cần danh mục và đơn vị tính");
      }
      category = await tx.itemCategory.findUnique({ where: { name: categoryName } });
      if (category && category.unit !== unit) {
        throw new ConflictException(
          `Danh mục ${categoryName} đang dùng đơn vị ${category.unit}`,
        );
      }
      category ??= await tx.itemCategory.create({
        data: { name: categoryName, unit },
      });
    }

    const item = await tx.item.create({
      data: {
        sku,
        name,
        consumable: input.consumable,
        categoryId: category.id,
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: userId,
        action: "INVENTORY_CREATE_ITEM",
        entity: "Item",
        entityId: item.id,
        metadata: {
          sku,
          name,
          categoryId: category.id,
          consumable: input.consumable,
        },
      },
    });
    return item;
  }

  async import(
    userId: string,
    batchId: string,
    quantity: number,
    note?: string,
    source: TransactionSource = TransactionSource.SCAN,
    scopeWarehouseId?: string | null,
    requestId?: string,
  ) {
    await assertActorCanAccessBatch(this.prisma, userId, scopeWarehouseId, batchId);
    const result = await this.applyTxn(
      userId,
      batchId,
      TransactionType.IMPORT,
      quantity,
      note,
      source,
      scopeWarehouseId,
      requestId,
    );
    await this.recalcAfterTxn(batchId);
    return result;
  }

  async export(
    userId: string,
    batchId: string,
    quantity: number,
    note?: string,
    source: TransactionSource = TransactionSource.SCAN,
    scopeWarehouseId?: string | null,
    requestId?: string,
  ) {
    await assertActorCanAccessBatch(this.prisma, userId, scopeWarehouseId, batchId);
    const result = await this.applyTxn(
      userId,
      batchId,
      TransactionType.EXPORT,
      quantity,
      note,
      source,
      scopeWarehouseId,
      requestId,
    );
    await this.recalcAfterTxn(batchId);
    return result;
  }

  /**
   * Xuất lô 1 chạm — chế độ khẩn cấp (Bp0). Xuất nhiều batch cùng lúc trong 1
   * transaction; mỗi dòng vẫn atomic + audit. Thất bại 1 batch → rollback tất cả.
   */
  async bulkExport(
    userId: string,
    items: { batchId: string; quantity: number }[],
    note?: string,
    scopeWarehouseId?: string | null,
    requestId?: string,
  ) {
    const result = await this.prisma.$transaction((tx) =>
      withMutationIdempotency(
        tx,
        {
          actorId: userId,
          operation: "inventory.bulk-export",
          requestId,
          fingerprint: mutationFingerprint({ items, note }),
        },
        () => this.bulkExportInTx(tx, userId, items, note, scopeWarehouseId),
      ),
    );
    await Promise.all(items.map((item) => this.recalcAfterTxn(item.batchId)));
    return result;
  }

  /**
   * Xuất nhiều lô trong transaction do caller sở hữu. Scope và mutation dùng
   * cùng `tx` để không tạo cửa sổ TOCTOU. Không recalc readiness trước commit.
   */
  async bulkExportInTx(
    tx: Prisma.TransactionClient,
    userId: string,
    items: { batchId: string; quantity: number }[],
    note?: string,
    scopeWarehouseId?: string | null,
  ) {
    if (items.length === 0) {
      throw new BadRequestException("Danh sách xuất lô rỗng");
    }
    if (new Set(items.map((item) => item.batchId)).size !== items.length) {
      throw new BadRequestException("Mỗi lô chỉ được xuất một dòng trong cùng phiếu");
    }
    const orderedItems = items
      .map((item, index) => ({ item, index }))
      .sort((a, b) => a.item.batchId.localeCompare(b.item.batchId));
    for (const { item } of orderedItems) {
      await assertActorCanAccessBatch(tx, userId, scopeWarehouseId, item.batchId);
    }

    const results = new Array<Awaited<ReturnType<typeof this.decrementInTx>>>(items.length);
    for (const { item, index } of orderedItems) {
      results[index] = await this.decrementInTx(
        tx,
        userId,
        item.batchId,
        item.quantity,
        TransactionType.EXPORT,
        TransactionSource.BULK,
        note,
        scopeWarehouseId,
      );
    }
    return { count: results.length, batches: results };
  }

  /**
   * Nhập lại nhiều lô TRONG một transaction có sẵn — để service khác (vd hoàn kho
   * khi nhiệm vụ giao thất bại) gộp chung atomic với thao tác của nó. Bỏ qua dòng
   * qty <= 0. KHÔNG tự recalc readiness (gọi {@link recalcBatches} sau khi commit).
   */
  async bulkImportInTx(
    tx: Prisma.TransactionClient,
    userId: string,
    items: { batchId: string; quantity: number }[],
    note?: string,
  ) {
    const orderedItems = items
      .map((item, index) => ({ item, index }))
      .sort((a, b) => a.item.batchId.localeCompare(b.item.batchId));
    const results = new Array<Awaited<ReturnType<typeof this.incrementInTx>>>(items.length);
    for (const { item, index } of orderedItems) {
      if (item.quantity <= 0) continue;
      results[index] = await this.incrementInTx(
        tx,
        userId,
        item.batchId,
        item.quantity,
        note,
        TransactionSource.BULK,
      );
    }
    return results.filter((result) => result !== undefined);
  }

  /**
   * Nhập lô 1 chạm — đối xứng {@link bulkExport}. Dùng khi HOÀN KHO: lực lượng hiện trường
   * giao thất bại → nhập lại phần đã xuất về đúng lô cũ. Nhiều batch trong 1
   * transaction; thất bại 1 batch → rollback tất cả. Bỏ qua dòng qty <= 0.
   */
  async bulkImport(userId: string, items: { batchId: string; quantity: number }[], note?: string) {
    const valid = items.filter((item) => item.quantity > 0);
    if (valid.length === 0) return { count: 0, batches: [] };
    const results = await this.prisma.$transaction((tx) =>
      this.bulkImportInTx(tx, userId, valid, note),
    );
    await this.recalcBatches(valid.map((item) => item.batchId));
    return { count: results.length, batches: results };
  }

  /** Tính lại readiness cho các kho chứa những lô này (sau khi commit tx gộp bên ngoài). */
  async recalcBatches(batchIds: string[]) {
    await Promise.all([...new Set(batchIds)].map((id) => this.recalcAfterTxn(id)));
  }

  async transfer(
    userId: string,
    batchId: string,
    toShelfId: string,
    quantity: number,
    note?: string,
    scopeWarehouseId?: string | null,
    requestId?: string,
  ) {
    // Một transfer hợp lệ có thể chờ row lock của transfer đồng thời trên cùng batch.
    // Prisma mặc định chỉ chờ 2 giây để mở interactive transaction, ngắn hơn thời
    // gian serialize thực tế trên Windows/PostgreSQL local. Giới hạn 10 giây vẫn
    // fail-fast khi DB nghẽn, nhưng không biến một race hợp lệ thành lỗi hạ tầng giả.
    const transfer = await this.prisma.$transaction(
      (tx) =>
        withMutationIdempotency(
          tx,
          {
            actorId: userId,
            operation: "inventory.transfer",
            requestId,
            fingerprint: mutationFingerprint({
              batchId,
              toShelfId,
              quantity,
              note,
            }),
          },
          () =>
            transferInventoryInTx(tx, {
              userId,
              batchId,
              toShelfId,
              quantity,
              note,
              scopeWarehouseId,
            }),
        ),
      { maxWait: 10_000, timeout: 15_000 },
    );
    await this.recalcWarehouses(transfer.warehouseIds);
    return transfer.result;
  }

  private async recalcWarehouses(warehouseIds: string[]): Promise<void> {
    await Promise.all(
      [...new Set(warehouseIds)].map((warehouseId) =>
        this.readiness.recalculateWarehouse(warehouseId).catch((error) => {
          this.log.warn(
            `Recalc readiness sau điều chuyển lỗi (kho ${warehouseId}): ${error.message}`,
          );
        }),
      ),
    );
  }

  // Import/Export: cập nhật số lượng atomically + audit. Không cho xuất quá tồn (PRD NFR-05).
  private async applyTxn(
    userId: string,
    batchId: string,
    type: TransactionType,
    quantity: number,
    note?: string,
    source: TransactionSource = TransactionSource.SCAN,
    scopeWarehouseId?: string | null,
    requestId?: string,
  ) {
    return this.prisma.$transaction((tx) =>
      withMutationIdempotency(
        tx,
        {
          actorId: userId,
          operation:
            type === TransactionType.IMPORT ? "inventory.import" : "inventory.export",
          requestId,
          fingerprint: mutationFingerprint({
            batchId,
            type,
            quantity,
            note,
            source,
          }),
        },
        async () => {
          if (type === TransactionType.IMPORT) {
            return this.incrementInTx(
              tx,
              userId,
              batchId,
              quantity,
              note,
              source,
              scopeWarehouseId,
            );
          }
          return this.decrementInTx(
            tx,
            userId,
            batchId,
            quantity,
            type,
            source,
            note,
            scopeWarehouseId,
          );
        },
      ),
    );
  }

  /**
   * Giảm số lượng lô (xuất) bằng CẬP NHẬT NGUYÊN TỬ CÓ ĐIỀU KIỆN (#6 chống race):
   * `updateMany WHERE quantity >= x`. Database tự tuần tự hóa — 2 người xuất cùng
   * lúc không âm kho. Nếu 0 dòng cập nhật → không đủ tồn.
   */
  private async decrementInTx(
    tx: Prisma.TransactionClient,
    userId: string,
    batchId: string,
    quantity: number,
    type: TransactionType,
    source: TransactionSource,
    note?: string,
    scopeWarehouseId?: string | null,
  ) {
    // Export phải serialize với borrow/return/report approval để phần đang cho
    // mượn không thể bị xuất lần hai trong một request đồng thời.
    await lockLoanTableForApproval(tx);
    await lockLoanBatch(tx, batchId);
    const before = await tx.itemBatch.findUnique({
      where: { id: batchId },
      include: { shelf: { select: { isLocked: true } } },
    });
    if (!before) throw new NotFoundException("Không tìm thấy lô vật tư");
    if (before.status && before.status !== ItemStatus.AVAILABLE) {
      throw new BadRequestException("Lô vật tư không ở trạng thái có thể xuất");
    }
    if (
      before.condition &&
      before.condition !== ItemCondition.NEW &&
      before.condition !== ItemCondition.USED
    ) {
      throw new BadRequestException("Lô vật tư hỏng hoặc đang chờ kiểm tra");
    }
    if (before.shelf?.isLocked) {
      throw new BadRequestException("Kệ chứa lô đang bị khóa");
    }
    if (before.expiryDate && before.expiryDate.getTime() <= Date.now()) {
      throw new BadRequestException("Lô vật tư đã hết hạn");
    }

    const openLoans = await tx.loanRecord.findMany({
      where: {
        batchId,
        status: { in: [LoanStatus.ON_LOAN, LoanStatus.PARTIALLY_RETURNED] },
      },
      select: { quantity: true, returnedOk: true, returnedDamaged: true, lost: true },
    });
    const outstandingLoan = sumOutstanding(openLoans);
    const availableNow = before.quantity - outstandingLoan;
    if (quantity > availableNow) {
      throw new BadRequestException(
        `Không đủ tồn khả dụng: hiện ${availableNow}, đang cho mượn ${outstandingLoan}, yêu cầu xuất ${quantity}`,
      );
    }

    const result = await tx.itemBatch.updateMany({
      where: {
        id: batchId,
        // Giữ lại tối thiểu phần đang cho mượn ngay trong CAS của database.
        quantity: { gte: outstandingLoan + quantity },
        ...(scopeWarehouseId ? { shelf: { zone: { warehouseId: scopeWarehouseId } } } : {}),
      },
      data: { quantity: { decrement: quantity } },
    });
    if (result.count === 0) {
      // Phân biệt batch vừa bị chuyển khỏi scope với thiếu tồn; không trả lỗi 400
      // che mất vi phạm quyền khi shelfId đổi giữa scope check và update.
      await assertBatchInScope(tx, scopeWarehouseId, batchId);
      throw new BadRequestException(
        "Tồn khả dụng vừa thay đổi; hãy tải lại trước khi xuất",
      );
    }

    const afterBatch = await tx.itemBatch.findUnique({ where: { id: batchId } });
    if (!afterBatch) throw new NotFoundException("Không tìm thấy lô vật tư");

    return this.recordTxn(tx, {
      userId,
      batchId,
      type,
      source,
      quantity,
      note,
      before: afterBatch.quantity + quantity,
      after: afterBatch.quantity,
    });
  }

  /** Tăng số lượng lô (nhập). */
  private async incrementInTx(
    tx: Prisma.TransactionClient,
    userId: string,
    batchId: string,
    quantity: number,
    note: string | undefined,
    source: TransactionSource,
    scopeWarehouseId?: string | null,
  ) {
    const before = await tx.itemBatch.findUnique({
      where: { id: batchId },
      include: { shelf: { select: { isLocked: true } } },
    });
    if (!before) throw new NotFoundException("Không tìm thấy lô vật tư");
    if (before.shelf?.isLocked) {
      throw new ConflictException("Kệ chứa lô đang bị khóa");
    }

    if (scopeWarehouseId) {
      const result = await tx.itemBatch.updateMany({
        where: {
          id: batchId,
          shelf: { zone: { warehouseId: scopeWarehouseId } },
        },
        data: { quantity: { increment: quantity } },
      });
      if (result.count === 0) {
        await assertBatchInScope(tx, scopeWarehouseId, batchId);
        throw new NotFoundException("Không tìm thấy lô vật tư");
      }
    } else {
      await tx.itemBatch.update({
        where: { id: batchId },
        data: { quantity: { increment: quantity } },
      });
    }
    const afterBatch = await tx.itemBatch.findUnique({ where: { id: batchId } });
    if (!afterBatch) throw new NotFoundException("Không tìm thấy lô vật tư");
    return this.recordTxn(tx, {
      userId,
      batchId,
      type: TransactionType.IMPORT,
      source,
      quantity,
      note,
      before: afterBatch.quantity - quantity,
      after: afterBatch.quantity,
    });
  }

  importInTx(
    tx: Prisma.TransactionClient,
    userId: string,
    batchId: string,
    quantity: number,
    note: string | undefined,
    source: TransactionSource,
    scopeWarehouseId?: string | null,
  ) {
    return this.incrementInTx(tx, userId, batchId, quantity, note, source, scopeWarehouseId);
  }

  exportInTx(
    tx: Prisma.TransactionClient,
    userId: string,
    batchId: string,
    quantity: number,
    note: string | undefined,
    source: TransactionSource,
    scopeWarehouseId?: string | null,
  ) {
    return this.decrementInTx(
      tx,
      userId,
      batchId,
      quantity,
      TransactionType.EXPORT,
      source,
      note,
      scopeWarehouseId,
    );
  }

  /** Ghi giao dịch + audit before/after. Trả về batch đã cập nhật. */
  private async recordTxn(
    tx: Prisma.TransactionClient,
    p: {
      userId: string;
      batchId: string;
      type: TransactionType;
      source: TransactionSource;
      quantity: number;
      note?: string;
      before: number;
      after: number;
    },
  ) {
    const location = await tx.itemBatch.findUnique({
      where: { id: p.batchId },
      select: { shelf: { select: { zone: { select: { warehouseId: true } } } } },
    });
    const txn = await tx.inventoryTransaction.create({
      data: {
        batchId: p.batchId,
        userId: p.userId,
        type: p.type,
        source: p.source,
        quantity: p.quantity,
        beforeQuantity: p.before,
        afterQuantity: p.after,
        quantityDelta: p.after - p.before,
        note: p.note,
        warehouseId: location?.shelf?.zone.warehouseId,
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: p.userId,
        action: `INVENTORY_${p.type}`,
        entity: "ItemBatch",
        entityId: p.batchId,
        metadata: {
          quantity: p.quantity,
          before: p.before,
          after: p.after,
          source: p.source,
          note: p.note ?? null,
        },
      },
    });
    const batch = await tx.itemBatch.findUnique({ where: { id: p.batchId } });
    return { batch, transaction: txn };
  }
}

function isBeforeUtcToday(value: Date, now = new Date()): boolean {
  const startOfTodayUtc = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  return value.getTime() < startOfTodayUtc;
}
