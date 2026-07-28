import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import { ItemCondition } from "@prisma/client";

export class TransactionDto {
  @IsString()
  batchId!: string;

  @IsInt()
  @IsPositive()
  quantity!: number;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  requestId?: string;
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

  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  requestId?: string;
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

  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  requestId?: string;
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

  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  requestId?: string;
}

export class SetConditionDto {
  @IsString()
  batchId!: string;

  @IsEnum(ItemCondition)
  condition!: ItemCondition;

  @IsString()
  @MinLength(3)
  note!: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  requestId?: string;
}

export class NewInventoryItemDto {
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  sku!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name!: string;

  @IsBoolean()
  consumable!: boolean;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  categoryName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  unit?: string;
}

export class ReceiveBatchDto {
  @IsOptional()
  @IsString()
  itemId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => NewInventoryItemDto)
  newItem?: NewInventoryItemDto;

  @IsString()
  shelfId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  batchCode!: string;

  @IsInt()
  @IsPositive()
  quantity!: number;

  @IsOptional()
  @IsDateString()
  expiryDate?: string;

  @IsOptional()
  @IsEnum(ItemCondition)
  condition?: ItemCondition;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  requestId?: string;
}

export class SemanticSearchQueryDto {
  @IsString()
  @MinLength(2)
  query!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  limit: number = 5;
}

export class NormalizeItemInputDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  limit: number = 5;
}

export class TransactionHistoryQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit: number = 100;
}

export class BatchPageQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit: number = 100;
}
