import { Module } from "@nestjs/common";
import { AlertMailService } from "./alert-mail.service";

/** Gửi email cảnh báo sự cố. ConfigService lấy từ ConfigModule global (app.module). */
@Module({
  providers: [AlertMailService],
  exports: [AlertMailService],
})
export class MailModule {}
