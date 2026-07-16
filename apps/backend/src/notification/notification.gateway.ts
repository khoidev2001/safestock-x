import { OnModuleInit } from "@nestjs/common";
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import { UserRole } from "@prisma/client";
import { Server, Socket } from "socket.io";
import { NotificationService } from "./notification.service";

/** Room theo role: client join `role:RESCUE` để chỉ nhận thông báo của role mình. */
@WebSocketGateway({ cors: { origin: "*" } })
export class NotificationGateway implements OnModuleInit {
  @WebSocketServer() server!: Server;

  constructor(private notifications: NotificationService) {}

  onModuleInit() {
    // Service tạo notification → đẩy vào room role tương ứng.
    this.notifications.push = (role: UserRole, notification: unknown) => {
      this.server.to(`role:${role}`).emit("notification", notification);
    };
  }

  @SubscribeMessage("join-role")
  joinRole(@ConnectedSocket() client: Socket, @MessageBody() data: { role: UserRole }) {
    client.join(`role:${data.role}`);
    return { joined: data.role };
  }
}
