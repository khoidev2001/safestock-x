import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Permission, roleHasPermission, UserRole } from "@safestock/shared-types";
import { AuthenticatedRequest } from "../auth/authenticated-request";
import { PERMISSIONS_KEY } from "./permissions.decorator";

/**
 * Kiểm người dùng có ĐỦ MỌI quyền route yêu cầu (dựa trên role → ROLE_PERMISSIONS).
 * Route không gắn @RequirePermission → cho qua (chỉ cần JwtAuthGuard xác thực).
 *
 * Dùng SAU JwtAuthGuard; req.user được dựng từ User hiện tại trong DB.
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Partial<AuthenticatedRequest>>();
    const user = request.user;
    if (
      !user?.userId ||
      !user.email ||
      !user.organizationId ||
      !Object.values(UserRole).includes(user.role)
    ) {
      throw new UnauthorizedException("Chưa xác thực hoặc thiếu phạm vi tổ chức");
    }

    const hasAll = required.every((permission) => roleHasPermission(user.role, permission));
    if (!hasAll) {
      throw new ForbiddenException("Không đủ quyền thực hiện thao tác này");
    }

    return true;
  }
}
