import { Module } from "@nestjs/common";
import { InsightsController } from "./insights.controller";
import { InsightsService } from "./insights.service";
import { WeatherService } from "./weather";

@Module({
  controllers: [InsightsController],
  providers: [InsightsService, WeatherService],
  exports: [InsightsService, WeatherService],
})
export class InsightsModule {}
