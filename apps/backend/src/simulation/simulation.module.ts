import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { IncidentModule } from "../incident/incident.module";
import { InventoryModule } from "../inventory/inventory.module";
import { ReadinessModule } from "../readiness/readiness.module";
import { SimulationController } from "./simulation.controller";
import { SimulationService } from "./simulation.service";
import { RunnerService } from "./runner.service";
import { SimulationGateway } from "./simulation.gateway";
import { SimulationAccessService } from "./simulation-access.service";
import { SimulationSystemActorService } from "./simulation-system-actor.service";

@Module({
  imports: [AuthModule, ReadinessModule, InventoryModule, IncidentModule],
  controllers: [SimulationController],
  providers: [
    SimulationAccessService,
    SimulationSystemActorService,
    SimulationService,
    RunnerService,
    SimulationGateway,
  ],
  exports: [SimulationService, RunnerService],
})
export class SimulationModule {}
