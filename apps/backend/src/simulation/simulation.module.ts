import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { IncidentModule } from "../incident/incident.module";
import { SimulationController } from "./simulation.controller";
import { SimulationService } from "./simulation.service";
import { SimulationAccessService } from "./simulation-access.service";
import { DeviceAuthGuard } from "./device-auth.guard";
import { DeviceCredentialService } from "./device-credential.service";
import { TelemetryController } from "./telemetry.controller";

@Module({
  imports: [AuthModule, IncidentModule],
  controllers: [SimulationController, TelemetryController],
  providers: [SimulationAccessService, SimulationService, DeviceCredentialService, DeviceAuthGuard],
  exports: [SimulationService, DeviceCredentialService],
})
export class SimulationModule {}
