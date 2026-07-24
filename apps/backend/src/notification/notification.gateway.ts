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
import { NotificationService } from "./notification.service";

@WebSocketGateway({ cors: { origin: "*" } })
export class NotificationGateway implements OnModuleInit, OnGatewayInit, OnGatewayConnection {
  @WebSocketServer() server!: Server;

  constructor(
    private notifications: NotificationService,
    private webSocketAuth: WebSocketAuthService,
  ) {}

  afterInit(server: Server) {
    this.webSocketAuth.install(server);
  }

  handleConnection(client: Socket) {
    const principal = this.webSocketAuth.getPrincipal(client);
    if (!principal) {
      client.disconnect(true);
      return;
    }
    void client.join(`role:${principal.role}`);
  }

  onModuleInit() {
    this.notifications.push = (role: UserRole, notification: unknown) => {
      this.server.to(`role:${role}`).emit("notification", notification);
    };
  }
}
