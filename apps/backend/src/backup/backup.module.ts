import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { BackupController } from "./backup.controller";
import { BackupProcessor } from "./backup.processor";
import { BACKUP_QUEUE, BackupService } from "./backup.service";

@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = new URL(config.get("REDIS_URL") ?? "redis://localhost:6379");
        return { connection: { host: url.hostname, port: Number(url.port) || 6379 } };
      },
    }),
    BullModule.registerQueue({ name: BACKUP_QUEUE }),
  ],
  controllers: [BackupController],
  providers: [BackupService, BackupProcessor],
})
export class BackupModule {}
