import { Module } from "@nestjs/common";
import { InsightsModule } from "../insights/insights.module";
import { ReadinessModule } from "../readiness/readiness.module";
import { AssistantController } from "./assistant.controller";
import { AssistantService } from "./assistant.service";

@Module({
  imports: [InsightsModule, ReadinessModule],
  controllers: [AssistantController],
  providers: [AssistantService],
})
export class AssistantModule {}
