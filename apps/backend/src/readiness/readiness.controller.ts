import { Controller, Get, Param, Post, Request, UseGuards } from "@nestjs/common";
import { Permission } from "@safestock/shared-types";
import { AuthenticatedRequest } from "../auth/authenticated-request";
import { JwtAuthGuard } from "../auth/guards";
import {
  assertActorCanAccessWarehouse,
  assertWarehouseInScope,
} from "../inventory/warehouse-scope";
import { PrismaService } from "../prisma/prisma.service";
import { PermissionGuard } from "../rbac/permission.guard";
import { RequirePermission } from "../rbac/permissions.decorator";
import { ReadinessService } from "./readiness.service";

@UseGuards(JwtAuthGuard, PermissionGuard)
@RequirePermission(Permission.READINESS_VIEW)
@Controller("readiness")
export class ReadinessController {
  constructor(
    private readiness: ReadinessService,
    private prisma: PrismaService,
  ) {}

  /** Điểm sẵn sàng hiện tại của 1 kho (đã tính). */
  @Get("warehouses/:id")
  get(@Request() req: AuthenticatedRequest, @Param("id") id: string) {
    assertWarehouseInScope(req.user.warehouseId, id);
    return this.getAuthorizedWarehouseScore(req, id);
  }

  private async getAuthorizedWarehouseScore(
    req: AuthenticatedRequest,
    warehouseId: string,
  ) {
    await this.assertWarehouseAccess(req, warehouseId);
    return this.readiness.getWarehouseScore(warehouseId);
  }

  /** Điểm 1 khu (đã tính) — dùng cho dashboard/demo. */
  @Get("zones/:id")
  async getZone(@Request() req: AuthenticatedRequest, @Param("id") id: string) {
    const score = await this.readiness.getScore("ZONE", id);
    assertWarehouseInScope(req.user.warehouseId, score?.warehouseId);
    if (score?.warehouseId) {
      await this.assertWarehouseAccess(req, score.warehouseId);
    }
    return score;
  }

  /** Điểm 1 kệ (đã tính). */
  @Get("shelves/:id")
  async getShelf(@Request() req: AuthenticatedRequest, @Param("id") id: string) {
    const score = await this.readiness.getScore("SHELF", id);
    assertWarehouseInScope(req.user.warehouseId, score?.warehouseId);
    if (score?.warehouseId) {
      await this.assertWarehouseAccess(req, score.warehouseId);
    }
    return score;
  }

  /** Đề xuất cải thiện của 1 kho (sinh từ nguyên nhân trừ điểm). */
  @Get("warehouses/:id/recommendations")
  recommendations(@Request() req: AuthenticatedRequest, @Param("id") id: string) {
    assertWarehouseInScope(req.user.warehouseId, id);
    return this.getAuthorizedRecommendations(req, id);
  }

  private async getAuthorizedRecommendations(
    req: AuthenticatedRequest,
    warehouseId: string,
  ) {
    await this.assertWarehouseAccess(req, warehouseId);
    return this.readiness.getRecommendations(warehouseId);
  }

  /** Tính lại điểm toàn kho theo yêu cầu. */
  @Post("warehouses/:id/recalculate")
  recalculate(@Request() req: AuthenticatedRequest, @Param("id") id: string) {
    assertWarehouseInScope(req.user.warehouseId, id);
    return this.recalculateAuthorizedWarehouse(req, id);
  }

  private async recalculateAuthorizedWarehouse(
    req: AuthenticatedRequest,
    warehouseId: string,
  ) {
    await this.assertWarehouseAccess(req, warehouseId);
    return this.readiness.recalculateWarehouse(warehouseId);
  }

  private assertWarehouseAccess(
    req: AuthenticatedRequest,
    warehouseId: string,
  ): Promise<void> {
    return assertActorCanAccessWarehouse(
      this.prisma,
      req.user.userId,
      req.user.warehouseId,
      warehouseId,
    );
  }
}
