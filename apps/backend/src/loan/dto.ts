import {
  IsIn,
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

/** Xã mình gửi yêu cầu mượn sang xã lân cận. */
export class RequestInterCommuneLoanDto {
  @IsString()
  @MaxLength(120)
  peerCommuneName!: string;

  @IsString()
  @MaxLength(60)
  itemSku!: string;

  @IsString()
  @MaxLength(160)
  itemName!: string;

  @IsString()
  @MaxLength(40)
  unit!: string;

  @IsInt()
  @Min(1)
  quantity!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

/** Ghi tay một khoản đã thoả thuận qua điện thoại lúc mất mạng. */
export class RecordManualInterCommuneLoanDto {
  @IsIn(["OUTGOING", "INCOMING"])
  direction!: "OUTGOING" | "INCOMING";

  @IsString()
  @MaxLength(120)
  peerCommuneName!: string;

  @IsString()
  batchId!: string;

  @IsInt()
  @Min(1)
  quantity!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

/** Chuyển trạng thái một khoản mượn liên xã. */
export class AdvanceInterCommuneLoanDto {
  @IsIn(["APPROVED", "REJECTED", "CANCELLED", "ACTIVE", "PARTIALLY_RETURNED", "RETURNED"])
  to!: "APPROVED" | "REJECTED" | "CANCELLED" | "ACTIVE" | "PARTIALLY_RETURNED" | "RETURNED";

  /** Lô vật tư dùng cho bước này; bắt buộc khi bước đó có đụng kho. */
  @IsOptional()
  @IsString()
  batchId?: string;

  /** Số lượng trả lần này. Bỏ trống khi trả nốt phần còn nợ. */
  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

/** Yêu cầu mượn do máy chủ xã lân cận đẩy sang. */
export class InboundInterCommuneLoanDto {
  @IsString()
  @MaxLength(80)
  peerLoanId!: string;

  @IsString()
  @MaxLength(160)
  inboundKey!: string;

  @IsString()
  @MaxLength(60)
  itemSku!: string;

  @IsString()
  @MaxLength(160)
  itemName!: string;

  @IsString()
  @MaxLength(40)
  unit!: string;

  @IsInt()
  @Min(1)
  quantity!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
