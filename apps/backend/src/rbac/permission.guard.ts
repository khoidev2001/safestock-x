import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import {
  Permission,
  roleHasPermission,
  UserRole,
} from "@safestock/shared-types";
import { PERMISSIONS_KEY } from "./permissions.decorator";

/**
 * Kiểm người dùng có ĐỦ MỌI quyền route yêu cầu (dựa trên role → ROLE_PERMISSIONS).
 * Route không gắn @RequirePermission → cho qua (chỉ cần JwtAuthGuard xác thực).
 *
 * Dùng SAU JwtAuthGuard (cần req.user.role đã có).
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const role = request.user?.role as UserRole | undefined;
    if (!role) {
      throw new UnauthorizedException("Chưa xác thực");
    }

    const hasAll = required.every((permission) =>
      roleHasPermission(role, permission),
    );
    if (!hasAll) {
      throw new ForbiddenException("Không đủ quyền thực hiện thao tác này");
    }

    return true;
  }
}
