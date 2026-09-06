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

  /**
   * Chỉ định hàng bằng MỘT trong hai cách: mã vật tư (giao diện dùng) hoặc mã lô
   * (khi cần chỉ đúng một lô cụ thể). Thiếu cả hai thì service từ chối — không
   * kiểm ở đây được vì luật "một trong hai" cần nhìn cả hai trường cùng lúc.
   */
  @IsOptional()
  @IsString()
  batchId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  itemSku?: string;

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

  /**
   * Lô vật tư dùng cho bước này.
   *
   * Bỏ trống là bình thường: giao diện KHÔNG bắt người trực chép mã lô nữa, máy
   * chủ tự chọn lô hạn gần nhất theo mã vật tư của khoản mượn. Chỉ truyền khi
   * thật sự cần chỉ đúng một lô.
   */
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

  /** Xã nào ở phía nhận. Máy chủ phục vụ nhiều xã thì thiếu cái này là đoán nhầm. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  toCommuneName?: string;

  /**
   * Xã GỬI tự xưng tên.
   *
   * Bên nhận vẫn suy được tên xã gửi từ khoá máy trong sổ đăng ký, nhưng đó là
   * chỗ dựa mong manh: nó chỉ đúng chừng nào mỗi khoá đại diện đúng một xã. Ai
   * biết tên xã gửi rõ nhất? Chính xã gửi. Hỏi thẳng nó thì không phải suy.
   *
   * Chỉ là NHÃN HIỂN THỊ, không phải danh tính. Quyền gửi đã chốt ở khoá máy từ
   * trước khi đọc tới đây; ai không có khoá thì không vào được, còn ai có khoá
   * thì vốn đã gửi được rồi, khai tên gì cũng không mở thêm cửa nào.
   */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  fromCommuneName?: string;
}

/** Xã kia báo trạng thái mới của một khoản mượn. */
export class PeerStatusDto {
  @IsString()
  @MaxLength(80)
  loanId!: string;

  @IsIn([
    "REQUESTED",
    "APPROVED",
    "REJECTED",
    "CANCELLED",
    "ACTIVE",
    "PARTIALLY_RETURNED",
    "RETURNED",
  ])
  status!:
    | "REQUESTED"
    | "APPROVED"
    | "REJECTED"
    | "CANCELLED"
    | "ACTIVE"
    | "PARTIALLY_RETURNED"
    | "RETURNED";

  @IsInt()
  @Min(0)
  returnedQuantity!: number;
}
