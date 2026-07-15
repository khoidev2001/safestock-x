import { Request } from "express";
import { UserRole } from "@safestock/shared-types";

/** Thông tin người dùng gắn vào request sau khi JwtStrategy.validate chạy. */
export interface AuthUser {
  userId: string;
  email: string;
  role: UserRole;
}

/** Request đã xác thực — thay cho `req: any` (CODING-STANDARDS §6.1). */
export interface AuthenticatedRequest extends Request {
  user: AuthUser;
}
