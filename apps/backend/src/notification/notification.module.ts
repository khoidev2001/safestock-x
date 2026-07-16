import { Global, Module } from "@nestjs/common";
import { NotificationController } from "./notification.controller";
import { NotificationGateway } from "./notification.gateway";
import { NotificationService } from "./notification.service";

/** Global: Mission (workflow) đẩy notification mỗi bước. */
@Global()
@Module({
  controllers: [NotificationController],
  providers: [NotificationService, NotificationGateway],
  exports: [NotificationService],
})
export class NotificationModule {}
