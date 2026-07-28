import { Body, Controller, Get, Param, Post, Query, Request, UseGuards } from "@nestjs/common";
import { IsIn, IsInt, IsNumber, IsOptional, IsString } from "class-validator";
import { scenarios } from "@safestock/scenario-definitions";
import { Permission } from "@safestock/shared-types";
import { JwtAuthGuard } from "../auth/guards";
import { AuthenticatedRequest } from "../auth/authenticated-request";
import { PermissionGuard } from "../rbac/permission.guard";
import { RequirePermission } from "../rbac/permissions.decorator";
import { SimulationService } from "./simulation.service";
import { RunnerService } from "./runner.service";
import { SimulationAccessService } from "./simulation-access.service";

class EmitDto {
  @IsString() warehouseId!: string;
  @IsString() deviceCode!: string;
  @IsString() eventType!: string;
  @IsNumber() value!: number;
  @IsOptional() @IsString() scenarioId?: string;
}

class CreateRunDto {
  @IsString() scenarioKey!: string;
  @IsString() warehouseId!: string;
  @IsOptional() @IsInt() seed?: number;
  @IsOptional() @IsIn([1, 10]) speed?: number;
}

@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller("simulator")
export class SimulationController {
  constructor(
    private sim: SimulationService,
    private runner: RunnerService,
    private access: SimulationAccessService,
  ) {}

  @Get("scenarios")
  @RequirePermission(Permission.SIMULATION_VIEW)
  async listScenarios(@Request() req: AuthenticatedRequest) {
    await this.access.assertPermission(req.user.userId, Permission.SIMULATION_VIEW);
    return scenarios.map((s) => ({ key: s.key, name: s.name, description: s.description }));
  }

  // IoT/simulator chỉ thuộc kho trung tâm; kho thôn vận hành thủ công qua web/mobile.
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

  // Bắn 1 event thủ công (slider ở G2/B3)
  @Post("events")
  @RequirePermission(Permission.SIMULATION_MUTATE)
  emit(@Request() req: AuthenticatedRequest, @Body() dto: EmitDto) {
    return this.sim.emit(req.user.userId, dto);
  }

  @Post("runs")
  @RequirePermission(Permission.SIMULATION_MUTATE)
  createRun(@Request() req: AuthenticatedRequest, @Body() dto: CreateRunDto) {
    return this.runner.createRun(
      req.user.userId,
      dto.scenarioKey,
      dto.warehouseId,
      dto.seed ?? 42,
      dto.speed ?? 1,
    );
  }

  @Post("runs/:id/play")
  @RequirePermission(Permission.SIMULATION_MUTATE)
  play(@Request() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.runner.play(req.user.userId, id);
  }

  @Post("runs/:id/pause")
  @RequirePermission(Permission.SIMULATION_MUTATE)
  pause(@Request() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.runner.pause(req.user.userId, id);
  }

  @Post("runs/:id/reset")
  @RequirePermission(Permission.SIMULATION_MUTATE)
  reset(@Request() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.runner.reset(req.user.userId, id);
  }
}
