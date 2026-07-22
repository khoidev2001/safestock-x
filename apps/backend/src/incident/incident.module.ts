import { Module } from "@nestjs/common";
import { MailModule } from "../mail/mail.module";
import { IncidentController } from "./incident.controller";
import { IncidentService } from "./incident.service";

@Module({
  imports: [MailModule],
  controllers: [IncidentController],
  providers: [IncidentService],
  exports: [IncidentService],
})
export class IncidentModule {}
