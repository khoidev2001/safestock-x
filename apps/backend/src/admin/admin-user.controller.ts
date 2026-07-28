import { Body, Controller, Delete, Get, Param, Patch, Post, Request, UseGuards } from "@nestjs/common";
import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { Permission, UserRole } from "@safestock/shared-types";
import { AuthenticatedRequest } from "../auth/authenticated-request";
import { JwtAuthGuard } from "../auth/guards";
import { PermissionGuard } from "../rbac/permission.guard";
import { RequirePermission } from "../rbac/permissions.decorator";
import { AdminUserService } from "./admin-user.service";

class CreateUserDto {
  @IsOptional()
  @IsString()
  @MaxLength(254)
  email?: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsString()
  @MinLength(2)
  fullName!: string;

  @IsEnum(UserRole)
  role!: UserRole;

  @IsOptional()
  @IsString()
  warehouseId?: string; // gán kho khi tạo trưởng thôn
}

class UpdateUserDto {
  @IsOptional() @IsString() @MinLength(2) fullName?: string;
  @IsOptional() @IsEnum(UserRole) role?: UserRole;
  @IsOptional() @IsString() warehouseId?: string | null;
  @IsOptional() @IsString() @MinLength(8) password?: string;
}

@UseGuards(JwtAuthGuard, PermissionGuard)
@RequirePermission(Permission.ADMIN_USERS)
@Controller("admin/users")
export class AdminUserController {
  constructor(private users: AdminUserService) {}

  @Get()
  list(@Request() req: AuthenticatedRequest) {
    return this.users.list(req.user.userId);
  }

  /** ADMIN tạo user; gán warehouseId để biến thành trưởng thôn scope kho. */
  @Post()
  create(@Request() req: AuthenticatedRequest, @Body() dto: CreateUserDto) {
    return this.users.create(req.user.userId, dto);
  }

  @Patch(":id")
  update(@Request() req: AuthenticatedRequest, @Param("id") id: string, @Body() dto: UpdateUserDto) {
    return this.users.update(req.user.userId, id, dto);
  }

  @Delete(":id")
  remove(@Request() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.users.remove(req.user.userId, id);
  }
}
