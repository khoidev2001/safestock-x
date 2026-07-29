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
  @Matches(/^[+0-9][0-9 .()-]{7,19}$/)
  phone?: string | null;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === "string" ? value.trim().toLowerCase() || null : value,
  )
  @IsEmail()
  @MaxLength(254)
  notificationEmail?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80_000)
  avatarUrl?: string | null;
}
