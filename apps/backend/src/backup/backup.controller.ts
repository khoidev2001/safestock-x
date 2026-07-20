import { Controller, Post, UseGuards } from "@nestjs/common";
import { Permission } from "@safestock/shared-types";
import { JwtAuthGuard } from "../auth/guards";
import { PermissionGuard } from "../rbac/permission.guard";
import { RequirePermission } from "../rbac/permissions.decorator";
import { BackupService } from "./backup.service";

@UseGuards(JwtAuthGuard, PermissionGuard)
@RequirePermission(Permission.AUDIT_VIEW)
@Controller("backup")
export class BackupController {
  constructor(private backup: BackupService) {}

  /** Chạy backup thủ công ngay (demo/test) — job vào hàng đợi, worker xử lý nền. */
  @Post("run")
  run() {
    return this.backup.triggerNow();
  }
}
