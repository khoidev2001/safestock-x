import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { AuthRateLimitService } from "./auth-rate-limit.service";
import { JwtStrategy } from "./jwt.strategy";
import { WebSocketAuthService } from "./websocket-auth.service";

@Module({
  imports: [PassportModule, JwtModule.register({})],
  controllers: [AuthController],
  providers: [AuthService, AuthRateLimitService, JwtStrategy, WebSocketAuthService],
  exports: [AuthService, WebSocketAuthService],
})
export class AuthModule {}
