import { Global, Module } from "@nestjs/common";
import { AuditController } from "./audit.controller";
import { AuditService } from "./audit.service";
import { PermissionGuard } from "./permission.guard";

/**
 * RBAC — phân quyền hạt mịn + nhật ký hậu kiểm.
 * Global vì AuditService + PermissionGuard dùng ở nhiều module.
 */
@Global()
@Module({
  controllers: [AuditController],
  providers: [AuditService, PermissionGuard],
  exports: [AuditService, PermissionGuard],
})
export class RbacModule {}
