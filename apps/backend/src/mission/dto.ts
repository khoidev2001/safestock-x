import { IsInt, IsNumber, IsOptional, IsString, Min, MinLength } from "class-validator";

/** Nhập tình huống bằng text (voice ở UI → text → gọi endpoint này). */
export class ParseDto {
  @IsString()
  @MinLength(5)
  description!: string;
}

/** Lập phương án: parse rồi phân bổ, HOẶC truyền tình huống đã parse sẵn. */
export class GeneratePlanDto {
  @IsString()
  warehouseId!: string;

  // Cách 1: mô tả text → backend gọi AI parse.
  @IsOptional()
  @IsString()
  description?: string;

  // Toạ độ điểm nạn (ghim tay) — chọn kho gần nhất trong cụm xã.
  @IsOptional()
  @IsNumber()
  incidentLat?: number;

  @IsOptional()
  @IsNumber()
  incidentLng?: number;

  // Cách 2: tình huống đã có cấu trúc (bỏ qua AI — nhập tay / test).
  @IsOptional()
  incident?: {
    incidentType: string;
    affectedPeople: number;
    durationHours: number;
    children?: number;
    elderly?: number;
    medicalSupportCases?: number;
  };
}
