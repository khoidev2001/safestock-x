import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Request,
  UseGuards,
} from "@nestjs/common";
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";
import { Transform } from "class-transformer";
import { Permission, UserRole } from "@safestock/shared-types";
import { JwtAuthGuard } from "../auth/guards";
import { AuthenticatedRequest } from "../auth/authenticated-request";
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

  /**
   * Xã (đơn vị) mà tài khoản QUẢN TRỊ mới thuộc về.
   *
   * Chỉ có nghĩa với role ADMIN và chỉ super admin gửi được. Trước đây mọi tài
   * khoản đều rơi vào đơn vị ĐẦU TIÊN trong cơ sở dữ liệu, đúng chừng nào hệ
   * thống còn phục vụ một xã duy nhất — nhưng mượn liên xã đòi phải có nhiều xã,
   * và khi đó "đơn vị đầu tiên" là một phép chọn ngẫu nhiên theo thứ tự bảng.
   *
   * Bỏ trống thì giữ nguyên nếp cũ: cùng đơn vị với người đang tạo.
   */
  @IsOptional()
  @IsString()
  organizationId?: string;

  /**
   * Chỉ dùng khi role = ADMIN: email nhận cảnh báo của quản trị viên mới, kèm mã 6 số
   * vừa gửi tới chính địa chỉ đó. Không có cặp này thì tài khoản ADMIN không được tạo —
   * quản trị viên là người nhận cảnh báo sự cố nên email phải là hộp thư có thật.
   */
  @IsOptional()
  @Transform(({ value }) => (typeof value === "string" ? value.trim().toLowerCase() : value))
  @IsEmail()
  @MaxLength(254)
  notificationEmail?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @Matches(/^[0-9]{6}$/, { message: "Mã xác minh gồm 6 chữ số" })
  verificationCode?: string;
}

class RequestAdminEmailCodeDto {
  @Transform(({ value }) => (typeof value === "string" ? value.trim().toLowerCase() : value))
  @IsEmail()
  @MaxLength(254)
  email!: string;
}

class UpdateUserDto {
  @IsOptional() @IsString() @MinLength(2) fullName?: string;
  @IsOptional() @IsEnum(UserRole) role?: UserRole;
  @IsOptional() @IsString() warehouseId?: string | null;
  @IsOptional() @IsString() @MinLength(8) password?: string;

  /**
   * Số điện thoại của người phụ trách — cũng chính là số gọi được của kho đó.
   *
   * Người phụ trách tự sửa được số của mình trong hồ sơ, nhưng lúc cần gọi gấp
   * thì người đi tìm số lại là quản trị viên, và số thiếu thì họ không có cách
   * nào điền hộ. Cùng luật kiểm với hồ sơ cá nhân (`auth/dto.ts`) để một số hợp
   * lệ ở màn này cũng hợp lệ ở màn kia.
   *
   * Chuỗi rỗng hoá `null` — "xoá số" là một ý định thật, khác với "không đụng tới".
   */
  @IsOptional()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() || null : value))
  @IsString()
  @Matches(/^[+0-9][0-9 .()-]{7,19}$/, { message: "Số điện thoại chưa đúng định dạng" })
  phone?: string | null;
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

  /** Danh sách xã để super admin chọn khi tạo tài khoản quản trị xã. */
  @Get("communes")
  communes(@Request() req: AuthenticatedRequest) {
    return this.users.listCommunes(req.user.userId);
  }

  /** Super admin xin mã 6 số cho email của tài khoản ADMIN sắp tạo. */
  @Post("email-verification")
  requestAdminEmailCode(
    @Request() req: AuthenticatedRequest,
    @Body() dto: RequestAdminEmailCodeDto,
  ) {
    return this.users.requestAdminEmailCode(req.user.userId, dto.email);
  }

  /** ADMIN tạo user; gán warehouseId để biến thành trưởng thôn scope kho. */
  @Post()
  create(@Request() req: AuthenticatedRequest, @Body() dto: CreateUserDto) {
    return this.users.create(req.user.userId, dto);
  }

  @Patch(":id")
  update(
    @Request() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.users.update(req.user.userId, id, dto);
  }

  @Delete(":id")
  remove(@Request() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.users.remove(req.user.userId, id);
  }
}
