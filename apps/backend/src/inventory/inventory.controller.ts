import { Body, Controller, Get, Param, Post, Query, Request, UseGuards } from "@nestjs/common";
import { Permission } from "@safestock/shared-types";
import { AuthenticatedRequest } from "../auth/authenticated-request";
import { JwtAuthGuard } from "../auth/guards";
import { PermissionGuard } from "../rbac/permission.guard";
import { RequirePermission } from "../rbac/permissions.decorator";
import { AdjustDto, BulkExportDto, ReconcileDto, TransactionDto, TransferDto } from "./dto";
import { InventoryAdjustmentService } from "./inventory-adjustment.service";
import { InventoryService } from "./inventory.service";

@UseGuards(JwtAuthGuard, PermissionGuard)
@RequirePermission(Permission.INVENTORY_READ)
@Controller("inventory")
export class InventoryController {
  constructor(
    private inv: InventoryService,
    private adjustment: InventoryAdjustmentService,
  ) {}

  @Get("warehouses/:id/tree")
  tree(@Param("id") id: string) {
    return this.inv.tree(id);
  }

  @Get("warehouses/:id/batches")
  batches(@Param("id") id: string) {
    return this.inv.listBatches(id);
  }

  @Get("scan")
  scan(@Query("sku") sku: string) {
    return this.inv.scanBySku(sku);
  }

  @RequirePermission(Permission.INVENTORY_IMPORT)
  @Post("import")
  import(@Request() req: AuthenticatedRequest, @Body() dto: TransactionDto) {
    return this.inv.import(req.user.userId, dto.batchId, dto.quantity, dto.note);
  }

  @RequirePermission(Permission.INVENTORY_EXPORT)
  @Post("export")
  export(@Request() req: AuthenticatedRequest, @Body() dto: TransactionDto) {
    return this.inv.export(req.user.userId, dto.batchId, dto.quantity, dto.note);
  }

  @RequirePermission(Permission.INVENTORY_EXPORT)
  @Post("transfer")
  transfer(@Request() req: AuthenticatedRequest, @Body() dto: TransferDto) {
    return this.inv.transfer(req.user.userId, dto.batchId, dto.toShelfId, dto.quantity, dto.note);
  }

  // Xuất lô 1 chạm — chế độ khẩn cấp (Bp0). Thao tác nhạy cảm.
  @RequirePermission(Permission.INVENTORY_BULK_EXPORT)
  @Post("bulk-export")
  bulkExport(@Request() req: AuthenticatedRequest, @Body() dto: BulkExportDto) {
    return this.inv.bulkExport(req.user.userId, dto.items, dto.note);
  }

  // Sửa tay số lượng (Bp2). Lý do bắt buộc, hậu kiểm.
  @RequirePermission(Permission.INVENTORY_ADJUST)
  @Post("adjust")
  adjust(@Request() req: AuthenticatedRequest, @Body() dto: AdjustDto) {
    return this.adjustment.adjust(req.user.userId, dto.batchId, dto.newQuantity, dto.reason);
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
    );
  }
}
