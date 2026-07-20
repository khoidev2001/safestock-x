import { Module } from "@nestjs/common";
import { ReadinessModule } from "../readiness/readiness.module";
import { InventoryController } from "./inventory.controller";
import { InventoryService } from "./inventory.service";
import { InventoryAdjustmentService } from "./inventory-adjustment.service";

@Module({
  imports: [ReadinessModule],
  controllers: [InventoryController],
  providers: [InventoryService, InventoryAdjustmentService],
  exports: [InventoryService, InventoryAdjustmentService],
})
export class InventoryModule {}
