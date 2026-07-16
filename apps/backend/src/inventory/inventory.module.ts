import { Module } from "@nestjs/common";
import { InventoryController } from "./inventory.controller";
import { InventoryService } from "./inventory.service";
import { InventoryAdjustmentService } from "./inventory-adjustment.service";

@Module({
  controllers: [InventoryController],
  providers: [InventoryService, InventoryAdjustmentService],
  exports: [InventoryService, InventoryAdjustmentService],
})
export class InventoryModule {}
