import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ServeStaticModule } from "@nestjs/serve-static";
import { join } from "path";
import { PrismaModule } from "./prisma/prisma.module";
import { HealthModule } from "./health/health.module";
import { AuthModule } from "./auth/auth.module";
import { RbacModule } from "./rbac/rbac.module";
import { AiModule } from "./ai/ai.module";
import { InventoryModule } from "./inventory/inventory.module";
import { LoanModule } from "./loan/loan.module";
import { MissionModule } from "./mission/mission.module";
import { IncidentModule } from "./incident/incident.module";
import { SimulationModule } from "./simulation/simulation.module";
import { ReadinessModule } from "./readiness/readiness.module";
import { NotificationModule } from "./notification/notification.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ["../../.env", ".env"] }),
    // Serve UI tối thiểu B3 tại /sim.html — public ở apps/backend/public (dist/src → ../../public)
    ServeStaticModule.forRoot({ rootPath: join(__dirname, "..", "..", "public") }),
    PrismaModule,
    RbacModule,
    AiModule,
    HealthModule,
    AuthModule,
    InventoryModule,
    LoanModule,
    MissionModule,
    IncidentModule,
    ReadinessModule,
    SimulationModule,
    NotificationModule,
  ],
})
export class AppModule {}
