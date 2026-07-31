import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";

/**
 * Hợp đồng số liệu dùng chung cho cả hai nguồn: người vận hành xác nhận trên
 * desktop, và gateway phần cứng tự đẩy lên. Một định nghĩa duy nhất để hai
 * đường không trôi khỏi nhau theo thời gian.
 */
export class SnapshotReadingDto {
  @IsString()
  @MaxLength(120)
  deviceCode!: string;

  @IsNumber()
  value!: number;

  /** Mốc đo riêng của cảm biến; thiếu thì lấy mốc chung của lô. */
  @IsOptional()
  @IsISO8601()
  observedAt?: string;

  /** Độ tin cậy phép đo 0..1 — pin yếu, nhiễu, ngoài dải đo. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  quality?: number;
}

export class ConfirmSnapshotDto {
  @IsString()
  warehouseId!: string;

  @IsString()
  @MaxLength(160)
  @Matches(/^[A-Za-z0-9._:-]+$/)
  idempotencyKey!: string;

  @IsISO8601()
  observedAt!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => SnapshotReadingDto)
  readings!: SnapshotReadingDto[];
}
