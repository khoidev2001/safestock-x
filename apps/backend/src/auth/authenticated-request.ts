import { Request } from "express";
import { UserRole } from "@safestock/shared-types";

/** Danh tính hiện tại từ cơ sở dữ liệu sau khi JwtStrategy xác thực token. */
export interface AuthUser {
  userId: string;
  email: string;
  role: UserRole;
  organizationId: string;
  warehouseId: string | null;
}

/** Request đã xác thực — thay cho `req: any` (CODING-STANDARDS §6.1). */
export interface AuthenticatedRequest extends Request {
  user: AuthUser;
}
