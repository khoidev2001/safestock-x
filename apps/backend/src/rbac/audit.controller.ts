import { Controller, Get, Query, Request, UseGuards } from "@nestjs/common";
import { Permission } from "@safestock/shared-types";
import { JwtAuthGuard } from "../auth/guards";
import { AuditService } from "./audit.service";
import { PermissionGuard } from "./permission.guard";
import { RequirePermission } from "./permissions.decorator";
import { AuthenticatedRequest } from "../auth/authenticated-request";

@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller("audit")
export class AuditController {
  constructor(private audit: AuditService) {}

  /** Tra soát nhật ký — hậu kiểm, chỉ ADMIN (audit:view). */
  @RequirePermission(Permission.AUDIT_VIEW)
  @Get()
  list(
    @Request() req: AuthenticatedRequest,
    @Query("entity") entity?: string,
    @Query("actorId") actorId?: string,
    @Query("limit") limit?: string,
  ) {
    return this.audit.list(req.user.userId, {
      entity,
      actorId,
      limit: limit ? Number(limit) : undefined,
    });
  }
}
