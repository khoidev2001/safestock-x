import { Body, Controller, Get, Param, Post, Query, Request, UseGuards } from "@nestjs/common";
import {
  ArrayMaxSize,
  IsArray,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from "class-validator";
import { Permission } from "@safestock/shared-types";
import { AuthenticatedRequest } from "../auth/authenticated-request";
import { JwtAuthGuard } from "../auth/guards";
import { PermissionGuard } from "../rbac/permission.guard";
import { RequirePermission } from "../rbac/permissions.decorator";
import { SimulationService } from "./simulation.service";
import { ConfirmSnapshotDto } from "./snapshot.dto";

class AlarmAcknowledgementDto {
  @IsString()
  warehouseId!: string;

  /** Lô số liệu do chính máy này gửi. */
  @IsOptional()
  @IsString()
  @MaxLength(160)
  @Matches(/^[A-Za-z0-9._:-]+$/)
  submissionKey?: string;

  /** Sự cố nhận qua realtime — nguồn phần cứng không đi kèm lô của máy này. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  incidentIds?: string[];

  @IsString()
  @MaxLength(160)
  @Matches(/^[A-Za-z0-9._:-]+$/)
  acknowledgementKey!: string;

  @IsISO8601()
  acknowledgedAt!: string;
}

@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller("simulator")
export class SimulationController {
  constructor(private readonly sim: SimulationService) {}

  @Get("first-warehouse")
  @RequirePermission(Permission.SIMULATION_VIEW)
  firstWarehouse(@Request() req: AuthenticatedRequest) {
    return this.sim.firstWarehouse(req.user.userId);
  }

  @Get("warehouses/:id/devices")
  @RequirePermission(Permission.SIMULATION_VIEW)
  devices(@Request() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.sim.listDevices(req.user.userId, id);
  }

  @Get("warehouses/:id/timeline")
  @RequirePermission(Permission.SIMULATION_VIEW)
  timeline(
    @Request() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Query("limit") limit?: string,
  ) {
    return this.sim.timeline(req.user.userId, id, limit ? Number(limit) : 50);
  }

  @Get("warehouses/:id/alarm-policy")
  @RequirePermission(Permission.SIMULATION_VIEW)
  alarmPolicy(@Request() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.sim.getPolicy(req.user.userId, id);
  }

  /** The only simulator mutation: an operator-confirmed batch of changed readings. */
  @Post("snapshots")
  @RequirePermission(Permission.SIMULATION_MUTATE)
  confirmSnapshot(@Request() req: AuthenticatedRequest, @Body() dto: ConfirmSnapshotDto) {
    return this.sim.submit(req.user.userId, dto);
  }

  /**
   * Tắt chuông. Quyền tách khỏi simulation:mutate: chuông có thể do cảm biến
   * thật kích hoạt, nên người trực kho phải tắt được mà không cần quyền bơm số
   * liệu mô phỏng.
   */
  @Post("alarm-acks")
  @RequirePermission(Permission.INCIDENT_ALARM_ACK)
  acknowledgeAlarm(@Request() req: AuthenticatedRequest, @Body() dto: AlarmAcknowledgementDto) {
    return this.sim.acknowledgeAlarm(req.user.userId, dto);
  }
}
