import { Body, Controller, Post, Request, UseGuards } from "@nestjs/common";
import { DeviceAuthGuard, type DeviceAuthenticatedRequest } from "./device-auth.guard";
import { ConfirmSnapshotDto } from "./snapshot.dto";
import { SimulationService } from "./simulation.service";

/**
 * Cửa vào của gateway phần cứng.
 *
 * Dùng ĐÚNG hợp đồng dữ liệu mà desktop đang gửi: cùng `idempotencyKey`, cùng
 * cách tách `observedAt`/`receivedAt`, cùng danh sách readings. Khác biệt duy
 * nhất là cách xác thực — thiết bị mang khoá của nó, không mượn tài khoản người.
 */
@UseGuards(DeviceAuthGuard)
@Controller("telemetry")
export class TelemetryController {
  constructor(private readonly sim: SimulationService) {}

  @Post("snapshots")
  ingest(@Request() req: DeviceAuthenticatedRequest, @Body() dto: ConfirmSnapshotDto) {
    return this.sim.ingestFromDevice(req.device, dto);
  }
}
