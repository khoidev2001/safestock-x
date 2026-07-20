import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import { Permission } from "@safestock/shared-types";
import { JwtAuthGuard } from "../auth/guards";
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
  get(@Param("id") id: string) {
    return this.insights.getWarehouseInsights(id);
  }

  /** Báo cáo xu hướng xuất kho theo tháng, có LLM diễn giải (fallback template). */
  @Get("warehouses/:id/monthly-report")
  monthlyReport(@Param("id") id: string) {
    return this.insights.getMonthlyReport(id);
  }
}
