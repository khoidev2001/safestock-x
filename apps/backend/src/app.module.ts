import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ServeStaticModule } from "@nestjs/serve-static";
import { join } from "path";
import { PrismaModule } from "./prisma/prisma.module";
import { HealthModule } from "./health/health.module";
import { AuthModule } from "./auth/auth.module";
import { InventoryModule } from "./inventory/inventory.module";
import { SimulationModule } from "./simulation/simulation.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ["../../.env", ".env"] }),
    // Serve UI tối thiểu B3 tại /sim.html — public ở apps/backend/public (dist/src → ../../public)
    ServeStaticModule.forRoot({ rootPath: join(__dirname, "..", "..", "public") }),
    PrismaModule,
    HealthModule,
    AuthModule,
    InventoryModule,
    SimulationModule,
  ],
})
export class AppModule {}
