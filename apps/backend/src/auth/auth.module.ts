import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { AuthRateLimitService } from "./auth-rate-limit.service";
import { JwtStrategy } from "./jwt.strategy";
import { WebSocketAuthService } from "./websocket-auth.service";
import { NotificationEmailService } from "./notification-email.service";
import { EmailVerificationService } from "./email-verification.service";
import { PasswordResetService } from "./password-reset.service";
import { MailModule } from "../mail/mail.module";
import { SmsModule } from "../sms/sms.module";
import { PhoneVerificationService } from "./phone-verification.service";

@Module({
  imports: [PassportModule, JwtModule.register({}), MailModule, SmsModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthRateLimitService,
    JwtStrategy,
    WebSocketAuthService,
    NotificationEmailService,
    EmailVerificationService,
    PasswordResetService,
    PhoneVerificationService,
  ],
  exports: [AuthService, WebSocketAuthService, EmailVerificationService],
})
export class AuthModule {}
