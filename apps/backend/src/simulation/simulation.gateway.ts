import { OnModuleInit } from "@nestjs/common";
import {
  OnGatewayConnection,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { WebSocketAuthService } from "../auth/websocket-auth.service";
import { RunnerService } from "./runner.service";
import { SimulationService } from "./simulation.service";
import { createRuntimeCorsOriginValidator } from "../config/http-security";

@WebSocketGateway({
  cors: {
    origin: createRuntimeCorsOriginValidator(),
    credentials: true,
  },
})
export class SimulationGateway implements OnModuleInit, OnGatewayInit, OnGatewayConnection {
  @WebSocketServer() server!: Server;

  constructor(
    private runner: RunnerService,
    private simulation: SimulationService,
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
    if (principal.warehouseIds.length > 0) {
      void client.join(principal.warehouseIds.map((warehouseId) => `wh:${warehouseId}`));
    }
  }

  onModuleInit() {
    const emit = (warehouseId: string, payload: unknown) => {
      this.server.to(`wh:${warehouseId}`).emit("sensor_event", payload);
    };
    this.runner.onEvent = emit;
    this.simulation.onEvent = emit;
  }
}
