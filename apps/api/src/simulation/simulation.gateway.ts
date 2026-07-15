import { OnModuleInit } from "@nestjs/common";
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { RunnerService } from "./runner.service";

// Room theo warehouseId: client join để chỉ nhận event kho mình quan tâm.
@WebSocketGateway({ cors: { origin: "*" } })
export class SimulationGateway implements OnModuleInit {
  @WebSocketServer() server!: Server;

  constructor(private runner: RunnerService) {}

  onModuleInit() {
    // Runner phát event → đẩy vào room warehouse
    this.runner.onEvent = (warehouseId, payload) => {
      this.server.to(`wh:${warehouseId}`).emit("sensor_event", payload);
    };
  }

  @SubscribeMessage("join")
  join(@ConnectedSocket() client: Socket, @MessageBody() data: { warehouseId: string }) {
    client.join(`wh:${data.warehouseId}`);
    return { joined: data.warehouseId };
  }
}
