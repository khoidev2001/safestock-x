import { Controller, Get, Param, Post, Query, Request, UseGuards } from "@nestjs/common";
import { Permission, UserRole } from "@safestock/shared-types";
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

  /** Thông báo của role người dùng hiện tại. */
  @Get()
  list(@Request() req: AuthenticatedRequest, @Query("unread") unread?: string) {
    return this.notifications.list(req.user.userId, req.user.role as UserRole, unread === "true");
  }

  @Post(":id/read")
  markRead(@Request() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.notifications.markRead(req.user.userId, req.user.role as UserRole, id);
  }

  @Post("read-all")
  markAllRead(@Request() req: AuthenticatedRequest) {
    return this.notifications.markAllRead(req.user.userId, req.user.role as UserRole);
  }
}
