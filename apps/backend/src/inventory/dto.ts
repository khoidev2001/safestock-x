import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";

export class TransactionDto {
  @IsString()
  batchId!: string;

  @IsInt()
  @IsPositive()
  quantity!: number;

  @IsOptional()
  @IsString()
  note?: string;
}

export class TransferDto extends TransactionDto {
  @IsString()
  toShelfId!: string;
}

class BulkExportItem {
  @IsString()
  batchId!: string;

  @IsInt()
  @IsPositive()
  quantity!: number;
}

export class BulkExportDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BulkExportItem)
  items!: BulkExportItem[];

  @IsOptional()
  @IsString()
  note?: string;
}

export class AdjustDto {
  @IsString()
  batchId!: string;

  @IsInt()
  @Min(0)
  newQuantity!: number;

  // Lý do BẮT BUỘC — thao tác nhạy cảm, hậu kiểm (CODING-STANDARDS §12).
  @IsString()
  @MinLength(3)
  reason!: string;
}

export class ReconcileDto {
  @IsString()
  batchId!: string;

  @IsInt()
  @Min(0)
  countedQty!: number;

  @IsOptional()
  @IsBoolean()
  applyOverride?: boolean;

  @IsOptional()
  @IsString()
  note?: string;
}
