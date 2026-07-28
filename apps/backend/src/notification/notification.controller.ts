import { Controller, Get, Param, Post, Query, Request, UseGuards } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { Permission } from "@safestock/shared-types";
import { AuthenticatedRequest } from "../auth/authenticated-request";
import { JwtAuthGuard } from "../auth/guards";
import { PermissionGuard } from "../rbac/permission.guard";
import { RequirePermission } from "../rbac/permissions.decorator";
import { NotificationService } from "./notification.service";

@UseGuards(JwtAuthGuard, PermissionGuard)
@RequirePermission(Permission.NOTIFICATION_VIEW)
@Controller("notifications")
export class NotificationController {
  constructor(private notifications: NotificationService) {}

  /** Thông báo của role và organization hiện tại từ database. */
  @Get()
  list(@Request() req: AuthenticatedRequest, @Query("unread") unread?: string) {
    return this.notifications.list(
      {
        role: req.user.role as UserRole,
        organizationId: req.user.organizationId,
        userId: req.user.userId,
        warehouseId: req.user.warehouseId,
      },
      unread === "true",
    );
  }

  @Post(":id/read")
  markRead(@Request() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.notifications.markRead(id, {
      role: req.user.role as UserRole,
      organizationId: req.user.organizationId,
      userId: req.user.userId,
      warehouseId: req.user.warehouseId,
    });
  }

  @Post("read-all")
  markAllRead(@Request() req: AuthenticatedRequest) {
    return this.notifications.markAllRead({
      role: req.user.role as UserRole,
      organizationId: req.user.organizationId,
      userId: req.user.userId,
      warehouseId: req.user.warehouseId,
    });
  }
}
