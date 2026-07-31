import { Module } from "@nestjs/common";
import { MailModule } from "../mail/mail.module";
import { IncidentController } from "./incident.controller";
import { IncidentService } from "./incident.service";
import { IncidentWatchdogService } from "./incident-watchdog.service";

@Module({
  imports: [MailModule],
  controllers: [IncidentController],
  providers: [IncidentService, IncidentWatchdogService],
  exports: [IncidentService],
})
export class IncidentModule {}
