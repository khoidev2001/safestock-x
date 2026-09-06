import { Module } from "@nestjs/common";
import { AlertMailService } from "./alert-mail.service";
import { AlertEmailOutboxService } from "./alert-email-outbox.service";
import { VerificationMailService } from "./verification-mail.service";

/** Gửi email cảnh báo sự cố. ConfigService lấy từ ConfigModule global (app.module). */
@Module({
  providers: [AlertMailService, AlertEmailOutboxService, VerificationMailService],
  exports: [AlertMailService, AlertEmailOutboxService, VerificationMailService],
})
export class MailModule {}
