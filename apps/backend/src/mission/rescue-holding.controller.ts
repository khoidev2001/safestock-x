import { Controller, Get, Param, Post, Query, Request, UseGuards } from "@nestjs/common";
import { Permission } from "@safestock/shared-types";
import { AuthenticatedRequest } from "../auth/authenticated-request";
import { JwtAuthGuard } from "../auth/guards";
import { PermissionGuard } from "../rbac/permission.guard";
import { RequirePermission } from "../rbac/permissions.decorator";
import { MissionSupplyService } from "./mission-supply.service";

/**
 * Sổ vật tư đội cứu hộ đang cầm — đường riêng, không nằm dưới `/missions/:id`.
 *
 * Sổ này thuộc về ĐỘI của cả xã chứ không thuộc một nhiệm vụ nào: phần đang giữ
 * đi xuyên qua nhiều nhiệm vụ liên tiếp, và câu hỏi người dùng đặt ra là "đội
 * đang cầm những gì", không phải "nhiệm vụ số 12 còn nợ những gì".
 */
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller("rescue-holdings")
export class RescueHoldingController {
  constructor(private readonly supply: MissionSupplyService) {}

  @RequirePermission(Permission.MISSION_VIEW)
  @Get()
  list(@Request() req: AuthenticatedRequest, @Query("includeReturned") includeReturned?: string) {
    return this.supply.listHoldings(req.user.userId, includeReturned === "true");
  }

  /** KHO xác nhận đã nhận lại — tới đây tồn kho mới được cộng lại. */
  @RequirePermission(Permission.MISSION_SUPPLY_RETURN_CONFIRM)
  @Post(":id/confirm-return")
  confirmReturn(@Request() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.supply.confirmHoldingReturn(id, req.user.userId, req.user.warehouseId);
  }
}
