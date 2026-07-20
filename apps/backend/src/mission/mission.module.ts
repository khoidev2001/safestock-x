import { Module } from "@nestjs/common";
import { GeoModule } from "../geo/geo.module";
import { InventoryModule } from "../inventory/inventory.module";
import { ReadinessModule } from "../readiness/readiness.module";
import { MissionController } from "./mission.controller";
import { MissionService } from "./mission.service";

@Module({
  imports: [GeoModule, InventoryModule, ReadinessModule],
  controllers: [MissionController],
  providers: [MissionService],
  exports: [MissionService],
})
export class MissionModule {}
