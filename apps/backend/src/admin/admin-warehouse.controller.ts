import { Body, Controller, Get, Param, Patch, Request, UseGuards } from "@nestjs/common";
import { IsNumber } from "class-validator";
import { Permission } from "@safestock/shared-types";
import { AuthenticatedRequest } from "../auth/authenticated-request";
import { JwtAuthGuard } from "../auth/guards";
import { PermissionGuard } from "../rbac/permission.guard";
import { RequirePermission } from "../rbac/permissions.decorator";
import { AdminWarehouseService } from "./admin-warehouse.service";

class LocationDto {
  @IsNumber()
  lat!: number;

  @IsNumber()
  lng!: number;
}

@UseGuards(JwtAuthGuard, PermissionGuard)
@RequirePermission(Permission.ADMIN_USERS)
@Controller("admin/warehouses")
export class AdminWarehouseController {
  constructor(private warehouses: AdminWarehouseService) {}

  /** Toàn bộ kho trong xã (kể cả chưa có toạ độ) — cho MapView dev mode. */
  @Get()
  list(@Request() req: AuthenticatedRequest) {
    return this.warehouses.listAll(req.user.userId);
  }

  /** Ghim/sửa toạ độ 1 kho. */
  @Patch(":id/location")
  updateLocation(
    @Request() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() dto: LocationDto,
  ) {
    return this.warehouses.updateLocation(req.user.userId, id, dto.lat, dto.lng);
  }
}
