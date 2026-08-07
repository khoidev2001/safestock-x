import { Body, Controller, Get, Param, Patch, Request, UseGuards } from "@nestjs/common";
import { IsNumber, ValidateIf } from "class-validator";
import { Permission } from "@safestock/shared-types";
import { AuthenticatedRequest } from "../auth/authenticated-request";
import { JwtAuthGuard } from "../auth/guards";
import { PermissionGuard } from "../rbac/permission.guard";
import { RequirePermission } from "../rbac/permissions.decorator";
import { AdminWarehouseService } from "./admin-warehouse.service";

class LocationDto {
  // null = xoá ghim, đưa kho về trạng thái chưa có vị trí. Phải gửi cả hai cùng
  // null; một nửa toạ độ thì không định vị được gì.
  @ValidateIf((dto: LocationDto) => dto.lat !== null)
  @IsNumber()
  lat!: number | null;

  @ValidateIf((dto: LocationDto) => dto.lng !== null)
  @IsNumber()
  lng!: number | null;
}

@UseGuards(JwtAuthGuard, PermissionGuard)
@RequirePermission(Permission.ADMIN_USERS)
@Controller("admin/warehouses")
export class AdminWarehouseController {
  constructor(private warehouses: AdminWarehouseService) {}

  /**
   * Toàn bộ kho trong xã, kể cả kho chưa có toạ độ.
   *
   * ĐỌC thì mọi vai xem được kho, SỬA thì vẫn chỉ quản trị. Bản đồ kho là màn
   * hình phụ trách kho dùng để biết kho thôn nằm ở đâu mà chuyển hàng tới — chặn
   * họ ở đây thì bản đồ hiện ra trống trơn, không có điểm nào, mà cũng không báo
   * lỗi gì. Nhìn như bản đồ hỏng chứ không như thiếu quyền.
   *
   * `listAll` đã lọc theo đơn vị của người gọi, nên không ai thấy kho của xã khác.
   */
  @RequirePermission(Permission.WAREHOUSE_MANAGE)
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
