import { IsInt, IsOptional, IsPositive, IsString } from "class-validator";

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
