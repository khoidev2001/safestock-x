import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from "class-validator";
import { Transform } from "class-transformer";

export class LoginDto {
  // "email" thực chất là định danh đăng nhập: có thể là email hoặc username (vd "admin")
  @IsString()
  email!: string;

  @IsString()
  @MinLength(6)
  password!: string;
}

export class RefreshDto {
  @IsOptional()
  @IsString()
  refreshToken?: string;
}

export class UpdateProfileDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  fullName?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() || null : value))
  @IsString()
  @Matches(/^[+0-9][0-9 .()-]{7,19}$/, {
    // Thông báo mặc định của class-validator in nguyên biểu thức chính quy ra màn
    // hình — người dùng đọc xong vẫn không biết phải sửa gì.
    message: "Số điện thoại chưa đúng định dạng",
  })
  phone?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80_000)
  avatarUrl?: string | null;
}

/**
 * Email cá nhân KHÔNG đi qua PATCH /auth/me nữa: nó chỉ được ghi sau khi mã 6 số
 * gửi tới chính hộp thư đó được nhập đúng (xem NotificationEmailService).
 */
export class RequestNotificationEmailDto {
  @Transform(({ value }) => (typeof value === "string" ? value.trim().toLowerCase() : value))
  @IsEmail()
  @MaxLength(254)
  email!: string;
}

export class ConfirmNotificationEmailDto {
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @Matches(/^[0-9]{6}$/, { message: "Mã xác minh gồm 6 chữ số" })
  code!: string;
}

/**
 * Số điện thoại cá nhân — cùng luật hai bước với email cảnh báo.
 *
 * Số chỉ vào hồ sơ sau khi mã 6 số gửi tới chính máy đó được nhập đúng (xem
 * PhoneVerificationService). Đây là số người trực bấm để gọi khi cần chi viện,
 * nên "người dùng gõ vào" chưa đủ để tin.
 */
export class RequestPhoneVerificationDto {
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MaxLength(20)
  phone!: string;
}

export class ConfirmPhoneVerificationDto {
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @Matches(/^[0-9]{6}$/, { message: "Mã xác minh gồm 6 chữ số" })
  code!: string;
}

/**
 * Quên mật khẩu — hai bước, KHÔNG cần đăng nhập.
 *
 * Chỉ nhận tên đăng nhập chứ không nhận email người gọi tự khai: mã luôn đi tới địa
 * chỉ đã xác minh sẵn của tài khoản, nếu không thì ai cũng trỏ được mã về hộp thư mình.
 */
export class RequestPasswordResetDto {
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(254)
  login!: string;
}

export class ConfirmPasswordResetDto {
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(254)
  login!: string;

  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @Matches(/^[0-9]{6}$/, { message: "Mã xác minh gồm 6 chữ số" })
  code!: string;

  // Mật khẩu KHÔNG cắt khoảng trắng: khoảng trắng có thể là một phần thật của mật khẩu.
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;
}
