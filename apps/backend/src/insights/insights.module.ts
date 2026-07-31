import { Module } from "@nestjs/common";
import { InsightsController } from "./insights.controller";
import { ReadinessModule } from "../readiness/readiness.module";
import { InsightsService } from "./insights.service";
import { WeatherService } from "./weather";

@Module({
  imports: [ReadinessModule],
  controllers: [InsightsController],
  providers: [InsightsService, WeatherService],
  exports: [InsightsService, WeatherService],
})
export class InsightsModule {}
