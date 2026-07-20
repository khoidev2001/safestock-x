import { Body, Controller, Get, Param, Patch, UseGuards } from "@nestjs/common";
import { IsNumber } from "class-validator";
import { Permission } from "@safestock/shared-types";
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
  list() {
    return this.warehouses.listAll();
  }

  /** Ghim/sửa toạ độ 1 kho. */
  @Patch(":id/location")
  updateLocation(@Param("id") id: string, @Body() dto: LocationDto) {
    return this.warehouses.updateLocation(id, dto.lat, dto.lng);
  }
}
