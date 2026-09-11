import { OnModuleInit } from "@nestjs/common";
import {
  OnGatewayConnection,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import { UserRole } from "@prisma/client";
import { Server, Socket } from "socket.io";
import { WebSocketAuthService } from "../auth/websocket-auth.service";
import { NotificationService, type NotificationTarget } from "./notification.service";
import { createRuntimeCorsOriginValidator } from "../config/http-security";

@WebSocketGateway({
  cors: {
    origin: createRuntimeCorsOriginValidator(),
    credentials: true,
  },
})
export class NotificationGateway implements OnModuleInit, OnGatewayInit, OnGatewayConnection {
  @WebSocketServer() server!: Server;

  constructor(
    private notifications: NotificationService,
    private webSocketAuth: WebSocketAuthService,
  ) {}

  afterInit(server: Server) {
    this.webSocketAuth.install(server);
  }

  /**
   * Mỗi ổ cắm vào HAI loại phòng: phòng chung của vai, và phòng riêng của từng kho
   * người đó phụ trách.
   *
   * Tin chung của cả xã đẩy vào phòng chung; lệnh gửi đích danh một kho đẩy vào
   * phòng riêng của kho đó. Trước đây chỉ có phòng chung, nên "kho thôn Long Châu
   * chuẩn bị vật tư" nổ chuông ở mọi kho trong xã — ba kho cùng tưởng tới lượt
   * mình, và kho thật sự phải xuất hàng thì không có gì để phân biệt.
   *
   * Tài khoản không gắn kho (điều phối, đội cứu hộ) có `warehouseIds` là toàn bộ
   * kho của xã, nên họ vẫn nghe được mọi lệnh gửi riêng — đúng như phần đọc lại
   * bằng HTTP đang cho phép.
   */
  handleConnection(client: Socket) {
    const principal = this.webSocketAuth.getPrincipal(client);
    if (!principal) {
      client.disconnect(true);
      return;
    }
    void client.join(notificationRoom(principal.organizationId, principal.role));
    for (const warehouseId of principal.warehouseIds) {
      void client.join(
        warehouseNotificationRoom(principal.organizationId, principal.role, warehouseId),
      );
    }
  }

  onModuleInit() {
    this.notifications.push = (target: NotificationTarget, notification: unknown) => {
      const room = target.warehouseId
        ? warehouseNotificationRoom(target.organizationId, target.role, target.warehouseId)
        : notificationRoom(target.organizationId, target.role);
      this.server.to(room).emit("notification", notification);
    };
  }
}

function notificationRoom(organizationId: string, role: UserRole): string {
  return `notification:${organizationId}:${role}`;
}

/** Phòng riêng của MỘT kho trong một vai — địa chỉ của lệnh gửi đích danh. */
function warehouseNotificationRoom(
  organizationId: string,
  role: UserRole,
  warehouseId: string,
): string {
  return `notification:${organizationId}:${role}:warehouse:${warehouseId}`;
}
