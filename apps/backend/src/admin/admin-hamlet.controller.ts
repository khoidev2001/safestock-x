import { Body, Controller, Get, Param, Patch, Post, Query, Request, UseGuards } from "@nestjs/common";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from "class-validator";
import { Permission } from "@safestock/shared-types";
import { AuthenticatedRequest } from "../auth/authenticated-request";
import { JwtAuthGuard } from "../auth/guards";
import { PermissionGuard } from "../rbac/permission.guard";
import { RequirePermission } from "../rbac/permissions.decorator";
import { AdminHamletService } from "./admin-hamlet.service";

class SaveHamletDto {
  @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @IsOptional() @IsString() @MaxLength(80) communeId?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) aliases?: string[];
  @IsOptional()
  @ValidateIf((dto: SaveHamletDto) => dto.lat != null || dto.lng != null)
  @IsNumber() @Min(-90) @Max(90) lat?: number | null;
  @IsOptional()
  @ValidateIf((dto: SaveHamletDto) => dto.lat != null || dto.lng != null)
  @IsNumber() @Min(-180) @Max(180) lng?: number | null;
  @IsOptional() @IsBoolean() verified?: boolean;
}

@UseGuards(JwtAuthGuard, PermissionGuard)
@RequirePermission(Permission.ADMIN_USERS)
@Controller("admin/hamlets")
export class AdminHamletController {
  constructor(private readonly hamlets: AdminHamletService) {}

  @Get()
  list(@Request() req: AuthenticatedRequest, @Query("communeId") communeId?: string) {
    return this.hamlets.list(req.user.userId, communeId);
  }

  @Post()
  create(@Request() req: AuthenticatedRequest, @Body() dto: SaveHamletDto) {
    return this.hamlets.create(req.user.userId, dto);
  }

  @Patch(":id")
  update(
    @Request() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() dto: SaveHamletDto,
  ) {
    return this.hamlets.update(req.user.userId, id, dto);
  }
}
