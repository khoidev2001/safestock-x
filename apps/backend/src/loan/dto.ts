import {
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

export class BorrowDto {
  @IsString()
  batchId!: string;

  @IsInt()
  @IsPositive()
  quantity!: number;

  @IsOptional()
  @IsString()
  missionId?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  requestId?: string;
}

export class ReturnDto {
  @IsInt()
  @Min(0)
  ok!: number;

  @IsInt()
  @Min(0)
  damaged!: number;

  @IsInt()
  @Min(0)
  lost!: number;

  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  requestId?: string;
}
