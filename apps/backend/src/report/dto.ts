import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";

/** Khoảng thời gian cho bảng thống kê sau thiên tai; bỏ trống = lấy toàn bộ. */
export class DisasterStatisticsQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}

export class RejectReportDto {
  @IsString()
  @MinLength(3)
  note!: string;
}

class SubmitStockReportRowDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  batchId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  batchCode?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  shelfCode?: string | null;

  @IsString()
  @MinLength(1)
  @MaxLength(64)
  sku!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(160)
  itemName!: string;

  @IsInt()
  @Min(0)
  quantity!: number;

  @IsString()
  @MaxLength(32)
  unit!: string;

  @IsOptional()
  @IsDateString()
  expiryDate?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  condition?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string | null;
}

export class SubmitStockReportDto {
  @IsString()
  warehouseId!: string;

  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  period!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SubmitStockReportRowDto)
  rows!: SubmitStockReportRowDto[];

  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  requestId?: string;
}
