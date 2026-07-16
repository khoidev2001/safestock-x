import { IsInt, IsOptional, IsPositive, IsString, Min } from "class-validator";

export class BorrowDto {
  @IsString()
  batchId!: string;

  @IsInt()
  @IsPositive()
  quantity!: number;

  @IsOptional()
  @IsString()
  missionId?: string;
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
}
