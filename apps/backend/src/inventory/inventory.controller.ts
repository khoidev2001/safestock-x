import { Body, Controller, Get, Param, Post, Query, Request, UseGuards } from "@nestjs/common";
import { UserRole } from "@safestock/shared-types";
import { JwtAuthGuard, Roles, RolesGuard } from "../auth/guards";
import { TransactionDto, TransferDto } from "./dto";
import { InventoryService } from "./inventory.service";

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("inventory")
export class InventoryController {
  constructor(private inv: InventoryService) {}

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

  @Roles(UserRole.WAREHOUSE_STAFF, UserRole.MANAGER)
  @Post("import")
  import(@Request() req: any, @Body() dto: TransactionDto) {
    return this.inv.import(req.user.userId, dto.batchId, dto.quantity, dto.note);
  }

  @Roles(UserRole.WAREHOUSE_STAFF, UserRole.MANAGER)
  @Post("export")
  export(@Request() req: any, @Body() dto: TransactionDto) {
    return this.inv.export(req.user.userId, dto.batchId, dto.quantity, dto.note);
  }

  @Roles(UserRole.WAREHOUSE_STAFF, UserRole.MANAGER)
  @Post("transfer")
  transfer(@Request() req: any, @Body() dto: TransferDto) {
    return this.inv.transfer(req.user.userId, dto.batchId, dto.toShelfId, dto.quantity, dto.note);
  }
}
