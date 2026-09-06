import { Module } from "@nestjs/common";
import { VerificationSmsService } from "./verification-sms.service";

@Module({
  providers: [VerificationSmsService],
  exports: [VerificationSmsService],
})
export class SmsModule {}
