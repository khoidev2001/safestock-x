import { Module } from "@nestjs/common";
import { InventoryModule } from "../inventory/inventory.module";
import { DisasterStatisticsService } from "./disaster-statistics.service";
import { ReportController } from "./report.controller";
import { ReportService } from "./report.service";

@Module({
  imports: [InventoryModule],
  controllers: [ReportController],
  providers: [ReportService, DisasterStatisticsService],
})
export class ReportModule {}
