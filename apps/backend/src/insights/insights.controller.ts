import { Controller, Get, Param, Request, UseGuards } from "@nestjs/common";
import { Permission } from "@safestock/shared-types";
import { AuthenticatedRequest } from "../auth/authenticated-request";
import { JwtAuthGuard } from "../auth/guards";
import { assertWarehouseInScope } from "../inventory/warehouse-scope";
import { PermissionGuard } from "../rbac/permission.guard";
import { RequirePermission } from "../rbac/permissions.decorator";
import { InsightsService } from "./insights.service";

@UseGuards(JwtAuthGuard, PermissionGuard)
@RequirePermission(Permission.READINESS_VIEW)
@Controller("insights")
export class InsightsController {
  constructor(private insights: InsightsService) {}

  /** Dự báo cạn kho + cảnh báo hết hạn + đề xuất cân bằng + thời tiết, cho 1 kho. */
  @Get("warehouses/:id")
  get(@Request() req: AuthenticatedRequest, @Param("id") id: string) {
    assertWarehouseInScope(req.user.warehouseId, id);
    return this.insights.getWarehouseInsights(id);
  }

  /** Báo cáo xu hướng xuất kho theo tháng, có LLM diễn giải (fallback template). */
  @Get("warehouses/:id/monthly-report")
  monthlyReport(@Request() req: AuthenticatedRequest, @Param("id") id: string) {
    assertWarehouseInScope(req.user.warehouseId, id);
    return this.insights.getMonthlyReport(id);
  }

  /** Bản tin đầu ngày theo đúng kho được phân công. */
  @Get("warehouses/:id/daily-briefing")
  dailyBriefing(@Request() req: AuthenticatedRequest, @Param("id") id: string) {
    assertWarehouseInScope(req.user.warehouseId, id);
    return this.insights.getDailyBriefing(id);
  }
}
