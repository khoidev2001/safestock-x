import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { IsIn, IsInt, IsNumber, IsOptional, IsString } from "class-validator";
import { scenarios } from "@safestock/scenario-definitions";
import { JwtAuthGuard } from "../auth/guards";
import { SimulationService } from "./simulation.service";
import { RunnerService } from "./runner.service";

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

@UseGuards(JwtAuthGuard)
@Controller("simulator")
export class SimulationController {
  constructor(
    private sim: SimulationService,
    private runner: RunnerService,
  ) {}

  @Get("scenarios")
  listScenarios() {
    return scenarios.map((s) => ({ key: s.key, name: s.name, description: s.description }));
  }

  // Tiện cho UI tối thiểu B3: lấy kho đầu tiên
  @Get("first-warehouse")
  firstWarehouse() {
    return this.sim.firstWarehouse();
  }

  @Get("warehouses/:id/devices")
  devices(@Param("id") id: string) {
    return this.sim.listDevices(id);
  }

  @Get("warehouses/:id/timeline")
  timeline(@Param("id") id: string, @Query("limit") limit?: string) {
    return this.sim.timeline(id, limit ? Number(limit) : 50);
  }

  // Bắn 1 event thủ công (slider ở G2/B3)
  @Post("events")
  emit(@Body() dto: EmitDto) {
    return this.sim.emit(dto);
  }

  @Post("runs")
  createRun(@Body() dto: CreateRunDto) {
    return this.runner.createRun(dto.scenarioKey, dto.warehouseId, dto.seed ?? 42, dto.speed ?? 1);
  }

  @Post("runs/:id/play")
  play(@Param("id") id: string) {
    return this.runner.play(id);
  }

  @Post("runs/:id/pause")
  pause(@Param("id") id: string) {
    return this.runner.pause(id);
  }

  @Post("runs/:id/reset")
  reset(@Param("id") id: string) {
    return this.runner.reset(id);
  }
}
