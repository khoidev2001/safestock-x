import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { IsEnum, IsOptional, IsString, Matches, MaxLength, MinLength } from "class-validator";
import { Transform } from "class-transformer";
import { Permission, UserRole } from "@safestock/shared-types";
import { JwtAuthGuard } from "../auth/guards";
import { PermissionGuard } from "../rbac/permission.guard";
import { RequirePermission } from "../rbac/permissions.decorator";
import { normalizeLoginEmail } from "../auth/login-email";
import { AdminUserService } from "./admin-user.service";

/**
 * Tên đăng nhập: username trần, không phải địa chỉ email.
 *
 * Trước đây ô này là `@IsEmail()`, nhưng seed sinh ra `admin`, `staff`, `longchau` —
 * không có @ nào. Web thì cho gõ tự do (nhãn "Email / tên đăng nhập"), nên ADMIN gõ
 * đúng dạng mà hệ thống đang dùng lại bị backend trả "email must be an email": tạo
 * tài khoản mới cho một thôn là không xong được.
 *
 * Chuẩn hoá bằng cùng hàm với lúc đăng nhập, nếu không thì tạo "Longchau" xong không
 * ai đăng nhập vào được — đăng nhập đưa về chữ thường rồi tra, ra `longchau`, không
 * khớp bản ghi nào.
 */
const LOGIN_NAME_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;

class CreateUserDto {
  @Transform(({ value }) => (typeof value === "string" ? normalizeLoginEmail(value) : value))
  @IsString()
  @MinLength(3)
  @MaxLength(64)
  @Matches(LOGIN_NAME_PATTERN, {
    message: "email chỉ gồm chữ thường, số và . _ -; bắt đầu bằng chữ hoặc số",
  })
  email!: string;

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
  list() {
    return this.users.list();
  }

  /** ADMIN tạo user; gán warehouseId để biến thành trưởng thôn scope kho. */
  @Post()
  create(@Body() dto: CreateUserDto) {
    return this.users.create(dto);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateUserDto) {
    return this.users.update(id, dto);
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.users.remove(id);
  }
}
