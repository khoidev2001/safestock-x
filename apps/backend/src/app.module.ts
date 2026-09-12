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
import { PushModule } from "./push/push.module";
import { InsightsModule } from "./insights/insights.module";
import { AssistantModule } from "./assistant/assistant.module";
import { BackupModule } from "./backup/backup.module";
import { AdminModule } from "./admin/admin.module";
import { ReportModule } from "./report/report.module";
import { CommuneContactModule } from "./contact/commune-contact.module";
import { validateEnv } from "./config/env.validation";
import { resolveEnvFilePaths } from "./config/env-file-path";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: resolveEnvFilePaths(),
      validate: validateEnv,
    }),
    // Serve trang thông tin API tĩnh từ apps/backend/public (dist/src → ../../public).
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, "..", "..", "public"),
      exclude: ["/api/{*path}"],
    }),
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
    PushModule,
    InsightsModule,
    AssistantModule,
    BackupModule,
    AdminModule,
    ReportModule,
    CommuneContactModule,
  ],
})
export class AppModule {}
