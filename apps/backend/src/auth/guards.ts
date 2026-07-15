import { AuthGuard } from "@nestjs/passport";

/** Xác thực JWT access token. Phân quyền dùng PermissionGuard (rbac/), không dùng role trực tiếp. */
export class JwtAuthGuard extends AuthGuard("jwt") {}
