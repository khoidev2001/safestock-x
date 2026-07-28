import { Module } from "@nestjs/common";
import { GeoService } from "./geo.service";
import { LocalRoutingService } from "./local-routing.service";

@Module({
  providers: [GeoService, LocalRoutingService],
  exports: [GeoService, LocalRoutingService],
})
export class GeoModule {}
