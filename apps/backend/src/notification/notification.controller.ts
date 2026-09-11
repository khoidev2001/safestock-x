import { Body, Controller, Get, Param, Post, Query, Request, UseGuards } from "@nestjs/common";
import { Permission, UserRole } from "@safestock/shared-types";
import { AuthenticatedRequest } from "../auth/authenticated-request";
import { JwtAuthGuard } from "../auth/guards";
import { PermissionGuard } from "../rbac/permission.guard";
import { RequirePermission } from "../rbac/permissions.decorator";
import { MarkNotificationsReadDto } from "./mark-read.dto";
import { NotificationService } from "./notification.service";

@UseGuards(JwtAuthGuard, PermissionGuard)
@RequirePermission(Permission.NOTIFICATION_VIEW)
@Controller("notifications")
export class NotificationController {
  constructor(private notifications: NotificationService) {}

  /**
   * Thông báo của role người dùng hiện tại.
   *
   * `cursor` + `limit` để điện thoại cuộn tới đâu tải tới đó; bỏ trống thì vẫn là
   * 50 dòng mới nhất như trước.
   */
  @Get()
  list(
    @Request() req: AuthenticatedRequest,
    @Query("unread") unread?: string,
    @Query("limit") limit?: string,
    @Query("cursor") cursor?: string,
  ) {
    return this.notifications.list(req.user.userId, req.user.role as UserRole, unread === "true", {
      limit: limit ? Number.parseInt(limit, 10) : undefined,
      cursor: cursor || undefined,
    });
  }

  @Post(":id/read")
  markRead(@Request() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.notifications.markRead(req.user.userId, req.user.role as UserRole, id);
  }

  /** Đánh dấu đã đọc theo lô — dùng khi bấm vào tab đang mang số việc chưa xem. */
  @Post("read")
  markManyRead(@Request() req: AuthenticatedRequest, @Body() body: MarkNotificationsReadDto) {
    return this.notifications.markManyRead(req.user.userId, req.user.role as UserRole, body.ids);
  }

  @Post("read-all")
  markAllRead(@Request() req: AuthenticatedRequest) {
    return this.notifications.markAllRead(req.user.userId, req.user.role as UserRole);
  }
}
