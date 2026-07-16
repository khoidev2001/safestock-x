import { Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { Permission } from "@safestock/shared-types";
import { JwtAuthGuard } from "../auth/guards";
import { PermissionGuard } from "../rbac/permission.guard";
import { RequirePermission } from "../rbac/permissions.decorator";
import { ReadinessService } from "./readiness.service";

@UseGuards(JwtAuthGuard, PermissionGuard)
@RequirePermission(Permission.READINESS_VIEW)
@Controller("readiness")
export class ReadinessController {
  constructor(private readiness: ReadinessService) {}

  /** Điểm sẵn sàng hiện tại của 1 kho (đã tính). */
  @Get("warehouses/:id")
  get(@Param("id") id: string) {
    return this.readiness.getWarehouseScore(id);
  }

  /** Điểm 1 khu (đã tính) — dùng cho dashboard/demo. */
  @Get("zones/:id")
  getZone(@Param("id") id: string) {
    return this.readiness.getScore("ZONE", id);
  }

  /** Điểm 1 kệ (đã tính). */
  @Get("shelves/:id")
  getShelf(@Param("id") id: string) {
    return this.readiness.getScore("SHELF", id);
  }

  /** Đề xuất cải thiện của 1 kho (sinh từ nguyên nhân trừ điểm). */
  @Get("warehouses/:id/recommendations")
  recommendations(@Param("id") id: string) {
    return this.readiness.getRecommendations(id);
  }

  /** Tính lại điểm toàn kho theo yêu cầu. */
  @Post("warehouses/:id/recalculate")
  recalculate(@Param("id") id: string) {
    return this.readiness.recalculateWarehouse(id);
  }
}
