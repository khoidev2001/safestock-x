import { OnModuleInit } from "@nestjs/common";
import {
  OnGatewayConnection,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { WebSocketAuthService } from "../auth/websocket-auth.service";
import { NotificationDelivery, NotificationService } from "./notification.service";

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
    void client.join([
      `role:${principal.role}`,
      this.organizationRoleRoom(principal.organizationId, principal.role),
      `user:${principal.userId}`,
      ...(principal.warehouseId
        ? [this.organizationWarehouseRoom(principal.organizationId, principal.warehouseId)]
        : []),
    ]);
  }

  onModuleInit() {
    this.notifications.push = (delivery: NotificationDelivery) => {
      if (delivery.organizationId) {
        const room = delivery.recipientUserId
          ? `user:${delivery.recipientUserId}`
          : delivery.role === "WAREHOUSE" && delivery.warehouseId
            ? this.organizationWarehouseRoom(delivery.organizationId, delivery.warehouseId)
            : this.organizationRoleRoom(delivery.organizationId, delivery.role);
        this.server.to(room).emit("notification", delivery.notification);
        return;
      }
      if (
        [
          "INCIDENT_REPORTED",
          "WAREHOUSE_REQUESTED",
          "WAREHOUSE_REQUEST_ACCEPTED",
          "WAREHOUSE_REQUEST_REVIEW",
        ].includes(delivery.kind)
      ) {
        return;
      }
      this.server.to(`role:${delivery.role}`).emit("notification", delivery.notification);
    };
  }

  private organizationRoleRoom(organizationId: string, role: string): string {
    return `org:${organizationId}:role:${role}`;
  }

  private organizationWarehouseRoom(organizationId: string, warehouseId: string): string {
    return `org:${organizationId}:warehouse:${warehouseId}`;
  }
}
