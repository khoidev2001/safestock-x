import { Module } from "@nestjs/common";
import { GeoModule } from "../geo/geo.module";
import { InventoryModule } from "../inventory/inventory.module";
import { ReadinessModule } from "../readiness/readiness.module";
import { InsightsModule } from "../insights/insights.module";
import { CoordinationSnapshotService } from "./coordination-snapshot.service";
import { EvidenceStorageService } from "./evidence-storage.service";
import { CoordinationAnalysisService } from "./coordination-analysis.service";
import { WhatIfService } from "./what-if.service";
import { MissionController } from "./mission.controller";
import { MissionCoordinationService } from "./mission-coordination.service";
import { MissionService } from "./mission.service";
import { FieldUpdateAssistantService } from "./field-update-assistant.service";
import { MissionWarehouseRequestService } from "./mission-warehouse-request.service";

@Module({
  imports: [GeoModule, InventoryModule, ReadinessModule, InsightsModule],
  controllers: [MissionController],
  providers: [
    MissionService,
    EvidenceStorageService,
    MissionCoordinationService,
    CoordinationSnapshotService,
    CoordinationAnalysisService,
    WhatIfService,
    FieldUpdateAssistantService,
    MissionWarehouseRequestService,
  ],
  exports: [MissionService],
})
export class MissionModule {}
