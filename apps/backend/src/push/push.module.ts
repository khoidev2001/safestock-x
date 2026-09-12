import { Global, Module, OnModuleInit } from "@nestjs/common";
import { NotificationService } from "../notification/notification.service";
import { PushController } from "./push.controller";
import { PushService } from "./push.service";

/** Global: mọi nơi phát thông báo đều cần đẩy được xuống điện thoại. */
@Global()
@Module({
  controllers: [PushController],
  providers: [PushService],
  exports: [PushService],
})
export class PushModule implements OnModuleInit {
  constructor(
    private readonly push: PushService,
    private readonly notifications: NotificationService,
  ) {}

  /**
   * Cắm kênh điện thoại vào luồng thông báo, y như gateway cắm kênh socket.
   *
   * Làm ở đây chứ không để NotificationService tự gọi PushService: giữ nguyên
   * nguyên tắc sẵn có là lõi thông báo không biết gì về đường truyền cụ thể, nên
   * gỡ hẳn thông báo đẩy ra khỏi hệ thống chỉ là bỏ một module.
   */
  onModuleInit() {
    this.notifications.pushToDevices = (target, notification) => {
      void this.push.pushToAudience(target, notification);
    };
  }
}
