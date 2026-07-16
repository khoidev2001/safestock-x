import { Module } from "@nestjs/common";
import { GeoModule } from "../geo/geo.module";
import { InventoryModule } from "../inventory/inventory.module";
import { MissionController } from "./mission.controller";
import { MissionService } from "./mission.service";

@Module({
  imports: [GeoModule, InventoryModule],
  controllers: [MissionController],
  providers: [MissionService],
  exports: [MissionService],
})
export class MissionModule {}
