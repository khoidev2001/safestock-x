import { SetMetadata } from "@nestjs/common";
import { Permission } from "@safestock/shared-types";

export const PERMISSIONS_KEY = "required_permissions";

/**
 * Đánh dấu 1 route cần các quyền cụ thể. Guard (PermissionGuard) kiểm dựa trên
 * ROLE_PERMISSIONS. Kiểm PERMISSION, không kiểm role trực tiếp (CODING-STANDARDS §13.3).
 *
 * @example @RequirePermission(Permission.INVENTORY_ADJUST)
 */
export const RequirePermission = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
