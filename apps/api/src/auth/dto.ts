import { IsString, MinLength } from "class-validator";

export class LoginDto {
  // "email" thực chất là định danh đăng nhập: có thể là email hoặc username (vd "admin")
  @IsString()
  email!: string;

  @IsString()
  @MinLength(6)
  password!: string;
}

export class RefreshDto {
  @IsString()
  refreshToken!: string;
}
