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

  handleConnection(client: Socket) {
    const principal = this.webSocketAuth.getPrincipal(client);
    if (!principal) {
      client.disconnect(true);
      return;
    }
    void client.join(notificationRoom(principal.organizationId, principal.role));
  }

  onModuleInit() {
    this.notifications.push = (organizationId: string, role: UserRole, notification: unknown) => {
      this.server.to(notificationRoom(organizationId, role)).emit("notification", notification);
    };
  }
}

function notificationRoom(organizationId: string, role: UserRole): string {
  return `notification:${organizationId}:${role}`;
}
