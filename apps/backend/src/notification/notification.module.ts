import { Global, Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { NotificationController } from "./notification.controller";
import { NotificationGateway } from "./notification.gateway";
import { NotificationService } from "./notification.service";

/** Global: Mission (workflow) đẩy notification mỗi bước. */
@Global()
@Module({
  imports: [AuthModule],
  controllers: [NotificationController],
  providers: [NotificationService, NotificationGateway],
  exports: [NotificationService],
})
export class NotificationModule {}
