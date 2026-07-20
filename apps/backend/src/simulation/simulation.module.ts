import { Module } from "@nestjs/common";
import { InventoryModule } from "../inventory/inventory.module";
import { ReadinessModule } from "../readiness/readiness.module";
import { SimulationController } from "./simulation.controller";
import { SimulationService } from "./simulation.service";
import { RunnerService } from "./runner.service";
import { SimulationGateway } from "./simulation.gateway";

@Module({
  imports: [ReadinessModule, InventoryModule],
  controllers: [SimulationController],
  providers: [SimulationService, RunnerService, SimulationGateway],
  exports: [SimulationService, RunnerService],
})
export class SimulationModule {}
