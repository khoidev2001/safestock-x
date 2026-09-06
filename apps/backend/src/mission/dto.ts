import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  Equals,
  IsEnum,
  IsISO8601,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from "class-validator";
import { DeliveryOutcome } from "@prisma/client";
import { MAX_DELIVERY_PHOTOS } from "./delivery-photos";
import { IncidentType } from "@safestock/shared-types";

/** Nhập tình huống bằng text (voice ở UI → text → gọi endpoint này). */
export class ParseDto {
  @IsString()
  @MinLength(5)
  description!: string;
}

/** Nhận dạng giọng nói: UI ghi âm WAV → base64 → PhoWhisper local trả text. */
export class TranscribeDto {
  @IsString()
  @MinLength(16)
  audioBase64!: string;

  @IsOptional()
  @IsString()
  mimeType?: string;
}

/** Lực lượng hiện trường từ chối nhiệm vụ — bắt buộc nêu lý do (admin xem xét sau). */
export class RejectMissionDto {
  @IsString()
  @MinLength(3)
  reason!: string;
}

/** Admin xử lý đơn từ chối (tạm hoãn / gửi lại / huỷ) — ghi chú không bắt buộc. */
export class AdminNoteDto {
  @IsOptional()
  @IsString()
  note?: string;
}

/** Một ảnh bằng chứng gửi kèm lúc báo kết quả: base64 thuần hoặc data URL. */
export class DeliveryPhotoDto {
  @IsString()
  // Trần ký tự tính theo base64 của một ảnh 5MB (~4/3 lần) cộng phần đầu data URL.
  // Chặn ở đây để thân quá khổ bị loại trước khi tốn công giải mã.
  @MaxLength(7_000_000)
  dataBase64!: string;
}

/**
 * Lực lượng hiện trường xác nhận kết quả giao (READY → COMPLETED).
 *
 * Ghi chú VÀ ảnh đều tuỳ chọn. Người vừa lội nước về tới nơi có thể chẳng còn gì
 * để kể thêm ngoài "đã giao xong" — bắt nhập cho đủ ô chỉ đẻ ra những dòng ghi
 * chú vô nghĩa, trong khi thứ thật sự cần ghi nhận là nhiệm vụ đã đóng.
 */
export class CompleteMissionDto {
  @IsIn(Object.values(DeliveryOutcome))
  outcome!: DeliveryOutcome;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @ArrayMaxSize(MAX_DELIVERY_PHOTOS)
  @ValidateNested({ each: true })
  @Type(() => DeliveryPhotoDto)
  photos?: DeliveryPhotoDto[];
}

export class WarehouseRequestNoteDto {
  @IsOptional()
  @IsString()
  @MaxLength(1_000)
  note?: string;
}

export class WarehouseRequestDiscrepancyDto {
  @IsString()
  @MinLength(3)
  @MaxLength(1_000)
  note!: string;
}

export class ConfirmPickupDto {
  @IsInt()
  @Min(0)
  receivedQuantity!: number;

  /**
   * Lý do thiếu. Không bắt buộc ở tầng này vì lấy ĐỦ thì không có gì để ghi;
   * bắt buộc khi thiếu là luật nghiệp vụ, và nó nằm ở validatePickup nơi biết
   * được số đã soạn là bao nhiêu.
   */
  @IsOptional()
  @IsString()
  @MaxLength(1_000)
  note?: string;
}

export class ReviewWarehouseRequestDto {
  @IsInt()
  @Min(1)
  requestedQuantity!: number;

  @IsOptional()
  @IsString()
  @MaxLength(1_000)
  adminNote?: string;
}

/**
 * Ghi nhận của Lực lượng hiện trường: chỉ nhận text đã được người dùng xác
 * nhận, bao gồm transcript voice. Không nhận audio thô, ảnh/video hay GPS.
 */
export class FieldUpdateDto {
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  requestId!: string;

  @IsIn(["TEXT", "VOICE_TRANSCRIPT"])
  inputMode!: "TEXT" | "VOICE_TRANSCRIPT";

  @IsString()
  @MinLength(1)
  @MaxLength(4_000)
  confirmedText!: string;

  @Equals(true)
  confirmedByUser!: true;

  @IsOptional()
  @IsISO8601()
  clientCapturedAt?: string;
}

/** ADMIN starts an immutable baseline analysis; it never edits the mission. */
export class AnalyzeMissionDto {
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  requestId!: string;

  @IsOptional()
  @IsString()
  @MinLength(5)
  @MaxLength(4_000)
  description?: string;
}

/** ADMIN-only What-if request. The text is parsed against a strict whitelist. */
export class WhatIfDto {
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  requestId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  baselineSnapshotId!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(500)
  assumptionText!: string;
}

/** Tình huống đã có cấu trúc — trust boundary chung cho các API lập phương án. */
export class IncidentDto {
  @IsEnum(IncidentType)
  incidentType!: IncidentType;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  location?: string;

  @IsInt()
  @Min(0)
  affectedPeople!: number;

  @IsInt()
  @Min(0)
  durationHours!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  children?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  elderly?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  medicalSupportCases?: number;
}

/** Toạ độ phải có đủ cặp và nằm trong miền hợp lệ, hoặc bỏ trống cả hai. */
class IncidentCoordinatesDto {
  @ValidateIf(
    (dto: IncidentCoordinatesDto) => dto.incidentLat !== undefined || dto.incidentLng !== undefined,
  )
  @IsNumber()
  @Min(-90)
  @Max(90)
  incidentLat?: number;

  @ValidateIf(
    (dto: IncidentCoordinatesDto) => dto.incidentLat !== undefined || dto.incidentLng !== undefined,
  )
  @IsNumber()
  @Min(-180)
  @Max(180)
  incidentLng?: number;
}

/**
 * Trưởng thôn (mobile) báo cáo tình huống từ hiện trường — chỉ gửi mô tả THÔ
 * (gõ tay hoặc voice→text). KHÔNG parse ở đây; admin mở tin trên web mới phân tích.
 */
export class SubmitReportDto extends IncidentCoordinatesDto {
  /**
   * Lời kể bằng chữ. KHÔNG bắt buộc khi có `audioBase64`.
   *
   * Người đứng giữa vùng ngập, một tay cầm ô một tay cầm điện thoại, gõ được vài
   * chữ là may. Bắt gõ tối thiểu năm ký tự trong khi họ đã nói xong cả đoạn vào
   * micro là dựng thêm một rào chắn ngay lúc họ ít rảnh tay nhất — và cái rào ấy
   * chỉ đẻ ra những báo cáo ghi "aaaaa" cho qua.
   *
   * Controller kiểm: phải có ÍT NHẤT một trong hai (chữ hoặc ghi âm).
   */
  @IsOptional()
  @IsString()
  @MinLength(5)
  @MaxLength(5000)
  description?: string;

  // Kho tiếp nhận (tuỳ chọn) — mặc định lấy theo scope trưởng thôn hoặc kho tổng xã.
  @IsOptional()
  @IsString()
  warehouseId?: string;

  // Một báo cáo logic giữ nguyên key qua timeout/retry; client cũ được phép bỏ trống.
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  requestId?: string;

  /**
   * Bản ghi âm gửi kèm, base64 (KHÔNG có tiền tố `data:`).
   *
   * Tách hẳn khỏi đường `transcribe`: đường kia đổi giọng nói thành chữ rồi vứt
   * file đi. Chữ nhận dạng ra có thể sai tên thôn, sai số người — mà đó đúng là
   * hai thứ quyết định điều bao nhiêu xe đi đâu. Giữ lại file để người điều phối
   * nghe thẳng lời người báo rồi tự điền.
   *
   * Trần 12MB base64 ≈ 9MB tệp: quá một phút WAV 16kHz mono thì đây không còn
   * là lời kể hiện trường nữa, mà body parser cũng chỉ nhận tới 25MB.
   */
  @IsOptional()
  @IsString()
  @MaxLength(12_000_000)
  audioBase64?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  audioMimeType?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(600_000)
  audioDurationMs?: number;
}

/**
 * Admin phân tích BÁO CÁO của trưởng thôn (report draft) — dùng lại kho + toạ độ
 * đã lưu trên mission, chỉ cần tình huống (parse từ mô tả HOẶC nhập cấu trúc sẵn).
 * Toạ độ tuỳ chọn để admin ghim lại điểm nạn chính xác hơn.
 */
export class PlanFromReportDto extends IncidentCoordinatesDto {
  // Cách 1: mô tả text → backend gọi AI parse (mặc định lấy reportText nếu bỏ trống).
  @IsOptional()
  @IsString()
  @MinLength(5)
  description?: string;

  // Cách 2: tình huống đã có cấu trúc (bỏ qua AI — nhập tay / test).
  @IsOptional()
  @ValidateNested()
  @Type(() => IncidentDto)
  incident?: IncidentDto;
}

/** Lập phương án: parse rồi phân bổ, HOẶC truyền tình huống đã parse sẵn. */
export class GeneratePlanDto extends IncidentCoordinatesDto {
  @IsString()
  warehouseId!: string;

  // Cách 1: mô tả text → backend gọi AI parse.
  @IsOptional()
  @IsString()
  @MinLength(5)
  description?: string;

  // Cách 2: tình huống đã có cấu trúc (bỏ qua AI — nhập tay / test).
  @IsOptional()
  @ValidateNested()
  @Type(() => IncidentDto)
  incident?: IncidentDto;
}
