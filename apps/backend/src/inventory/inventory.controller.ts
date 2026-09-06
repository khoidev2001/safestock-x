import { Body, Controller, Get, Param, Post, Query, Request, UseGuards } from "@nestjs/common";
import { Permission } from "@safestock/shared-types";
import { TransactionSource } from "@prisma/client";
import { AuthenticatedRequest } from "../auth/authenticated-request";
import { JwtAuthGuard } from "../auth/guards";
import { PermissionGuard } from "../rbac/permission.guard";
import { RequirePermission } from "../rbac/permissions.decorator";
import {
  AdjustDto,
  BatchPageQueryDto,
  BulkExportDto,
  NormalizeItemInputDto,
  ReceiveBatchDto,
  ReconcileDto,
  SemanticSearchQueryDto,
  SetConditionDto,
  TransactionHistoryQueryDto,
  TransactionDto,
  TransferDto,
} from "./dto";
import { InventoryAdjustmentService } from "./inventory-adjustment.service";
import { InventoryService } from "./inventory.service";
import { InventorySemanticService } from "./inventory-semantic.service";
import { BatchQrService } from "./batch-qr.service";

@UseGuards(JwtAuthGuard, PermissionGuard)
@RequirePermission(Permission.INVENTORY_READ)
@Controller("inventory")
export class InventoryController {
  constructor(
    private inv: InventoryService,
    private adjustment: InventoryAdjustmentService,
    private semantic: InventorySemanticService,
    private batchQr: BatchQrService,
  ) {}

  /** Ảnh mã QR của một lô, để điện thoại hiện lên mà không cần thư viện native. */
  @Get("batches/:id/qr")
  batchQrImage(@Request() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.batchQr.dataUrl(id, req.user.warehouseId);
  }

  @Get("warehouses/:id/tree")
  tree(@Request() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.inv.tree(id, req.user.warehouseId, req.user.userId);
  }

  @Get("warehouses/:id/batches")
  batches(@Request() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.inv.listBatches(id, req.user.warehouseId, req.user.userId);
  }

  /** Tồn kho toàn xã: kho tổng cộng với hàng đang nằm ở các kho thôn. */
  @Get("warehouses/:id/commune-stock")
  communeStock(@Request() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.inv.communeStock(id, req.user.warehouseId, req.user.userId);
  }

  /** Lô sắp cạn của cả xã, kèm tên kho đang giữ. */
  @Get("warehouses/:id/commune-low-stock")
  communeLowStock(
    @Request() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Query("threshold") threshold?: string,
  ) {
    // Ngưỡng đến từ URL nên chặn hai đầu: số âm cắt sạch danh sách, còn số quá
    // lớn biến bảng cảnh báo thành bảng liệt kê toàn bộ tồn kho.
    const parsed = Number.parseInt(threshold ?? "", 10);
    const limit = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 0), 1000) : 10;
    return this.inv.communeLowStock(id, req.user.warehouseId, req.user.userId, limit);
  }

  /** Lô sắp hết hạn của cả xã, kèm tên kho đang giữ. */
  @Get("warehouses/:id/commune-expiry")
  communeExpiry(
    @Request() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Query("days") days?: string,
  ) {
    // Cửa sổ ngày đến từ URL nên phải chặn hai đầu: "0" cắt sạch cảnh báo, còn
    // "9999" biến bảng cảnh báo thành bảng liệt kê toàn bộ hàng có hạn dùng.
    const parsed = Number.parseInt(days ?? "", 10);
    const windowDays = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), 365) : 30;
    return this.inv.communeExpiry(id, req.user.warehouseId, req.user.userId, windowDays);
  }

  @Get("warehouses/:id/batches-page")
  batchesPage(
    @Request() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Query() query: BatchPageQueryDto,
  ) {
    return this.inv.listBatchesPage(
      id,
      req.user.warehouseId,
      req.user.userId,
      query.cursor,
      query.limit,
    );
  }

  @Get("warehouses/:id/transactions")
  transactions(
    @Request() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Query() query: TransactionHistoryQueryDto,
  ) {
    return this.inv.listTransactions(id, req.user.warehouseId, req.user.userId, query.limit);
  }

  @RequirePermission(Permission.INVENTORY_EXPORT)
  @Get("warehouses/:id/transfer-destinations")
  transferDestinations(@Request() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.inv.transferDestinations(id, req.user.warehouseId, req.user.userId);
  }

  @Get("warehouses/:id/semantic-search")
  semanticSearch(
    @Request() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Query() query: SemanticSearchQueryDto,
  ) {
    return this.semantic.searchWarehouse(
      id,
      req.user.warehouseId,
      query.query,
      query.limit,
      req.user.userId,
    );
  }

  @RequirePermission(Permission.INVENTORY_IMPORT)
  @Post("normalize-input")
  normalizeInput(@Request() req: AuthenticatedRequest, @Body() dto: NormalizeItemInputDto) {
    return this.semantic.normalizeInput(req.user.userId, dto.name, dto.limit);
  }

  @Get("scan")
  scan(@Request() req: AuthenticatedRequest, @Query("sku") sku: string) {
    return this.inv.scanBySku(sku, req.user.warehouseId, req.user.userId);
  }

  @Get("catalog")
  catalog(@Request() req: AuthenticatedRequest) {
    return this.inv.listCatalog(req.user.userId);
  }

  @RequirePermission(Permission.INVENTORY_IMPORT)
  @Post("batches")
  receiveBatch(@Request() req: AuthenticatedRequest, @Body() dto: ReceiveBatchDto) {
    return this.inv.receiveBatch(
      req.user.userId,
      {
        itemId: dto.itemId,
        newItem: dto.newItem,
        shelfId: dto.shelfId,
        batchCode: dto.batchCode,
        quantity: dto.quantity,
        expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : null,
        condition: dto.condition,
        note: dto.note,
      },
      req.user.warehouseId,
      dto.requestId,
    );
  }

  @RequirePermission(Permission.INVENTORY_IMPORT)
  @Post("import")
  import(@Request() req: AuthenticatedRequest, @Body() dto: TransactionDto) {
    return this.inv.import(
      req.user.userId,
      dto.batchId,
      dto.quantity,
      dto.note,
      TransactionSource.MANUAL,
      req.user.warehouseId,
      dto.requestId,
    );
  }

  @RequirePermission(Permission.INVENTORY_EXPORT)
  @Post("export")
  export(@Request() req: AuthenticatedRequest, @Body() dto: TransactionDto) {
    return this.inv.export(
      req.user.userId,
      dto.batchId,
      dto.quantity,
      dto.note,
      TransactionSource.MANUAL,
      req.user.warehouseId,
      dto.requestId,
    );
  }

  @RequirePermission(Permission.INVENTORY_EXPORT)
  @Post("transfer")
  transfer(@Request() req: AuthenticatedRequest, @Body() dto: TransferDto) {
    return this.inv.transfer(
      req.user.userId,
      dto.batchId,
      dto.toShelfId,
      dto.quantity,
      dto.note,
      req.user.warehouseId,
      dto.requestId,
    );
  }

  // Xuất lô 1 chạm — chế độ khẩn cấp (Bp0). Thao tác nhạy cảm.
  @RequirePermission(Permission.INVENTORY_BULK_EXPORT)
  @Post("bulk-export")
  bulkExport(@Request() req: AuthenticatedRequest, @Body() dto: BulkExportDto) {
    return this.inv.bulkExport(
      req.user.userId,
      dto.items,
      dto.note,
      req.user.warehouseId,
      dto.requestId,
    );
  }

  // Sửa tay số lượng (Bp2). Lý do bắt buộc, hậu kiểm.
  @RequirePermission(Permission.INVENTORY_ADJUST)
  @Post("adjust")
  adjust(@Request() req: AuthenticatedRequest, @Body() dto: AdjustDto) {
    return this.adjustment.adjust(
      req.user.userId,
      dto.batchId,
      dto.newQuantity,
      dto.reason,
      req.user.warehouseId,
      dto.requestId,
    );
  }

  @RequirePermission(Permission.INVENTORY_ADJUST)
  @Post("condition")
  setCondition(@Request() req: AuthenticatedRequest, @Body() dto: SetConditionDto) {
    return this.adjustment.setCondition(
      req.user.userId,
      dto.batchId,
      dto.condition,
      dto.note,
      req.user.warehouseId,
      dto.requestId,
    );
  }

  // Đối chiếu kiểm kê (Bp2). Chỉ đếm IN_STOCK, trừ ON_LOAN.
  @RequirePermission(Permission.INVENTORY_RECONCILE)
  @Post("reconcile")
  reconcile(@Request() req: AuthenticatedRequest, @Body() dto: ReconcileDto) {
    return this.adjustment.reconcile(
      req.user.userId,
      dto.batchId,
      dto.countedQty,
      dto.applyOverride ?? false,
      dto.note,
      req.user.warehouseId,
      dto.requestId,
    );
  }
}
