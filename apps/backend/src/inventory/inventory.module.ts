import { Module } from "@nestjs/common";
import { ReadinessModule } from "../readiness/readiness.module";
import { InventoryController } from "./inventory.controller";
import { InventoryService } from "./inventory.service";
import { InventoryAdjustmentService } from "./inventory-adjustment.service";
import { InventorySemanticService } from "./inventory-semantic.service";
import { BatchQrService } from "./batch-qr.service";

@Module({
  imports: [ReadinessModule],
  controllers: [InventoryController],
  providers: [
    InventoryService,
    InventoryAdjustmentService,
    InventorySemanticService,
    BatchQrService,
  ],
  exports: [InventoryService, InventoryAdjustmentService, InventorySemanticService, BatchQrService],
})
export class InventoryModule {}
