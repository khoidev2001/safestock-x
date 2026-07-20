import { Module } from "@nestjs/common";
import { InventoryModule } from "../inventory/inventory.module";
import { ReportController } from "./report.controller";
import { ReportService } from "./report.service";

@Module({
  imports: [InventoryModule],
  controllers: [ReportController],
  providers: [ReportService],
})
export class ReportModule {}
