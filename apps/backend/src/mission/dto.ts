import { Type } from "class-transformer";
import {
  IsIn,
  IsArray,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
  ValidateIf,
} from "class-validator";
import { MAX_WAV_BASE64_LENGTH } from "./wav";

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
  @MaxLength(MAX_WAV_BASE64_LENGTH)
  audioBase64!: string;

  @IsOptional()
  @IsIn(["audio/wav"])
  mimeType?: string;
}

/** Admin xử lý đơn từ chối (tạm hoãn / gửi lại / huỷ) — ghi chú không bắt buộc. */
export class AdminNoteDto {
  @IsOptional()
  @IsString()
  note?: string;
}

/**
 * Trưởng thôn (mobile) báo cáo tình huống từ hiện trường. Audio và toạ độ là
 * các cặp toàn vẹn: truyền một trường thì bắt buộc truyền trường còn lại.
 */
export class SubmitReportDto {
  @IsString()
  @MinLength(5)
  description!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  location?: string;

  @IsOptional()
  @IsString()
  warehouseId?: string;

  @ValidateIf((value: SubmitReportDto) => value.audioBase64 != null || value.mimeType != null)
  @IsString()
  @MinLength(16)
  @MaxLength(MAX_WAV_BASE64_LENGTH)
  audioBase64?: string;

  @ValidateIf((value: SubmitReportDto) => value.audioBase64 != null || value.mimeType != null)
  @IsIn(["audio/wav"])
  mimeType?: string;

  @ValidateIf((value: SubmitReportDto) => value.incidentLat != null || value.incidentLng != null)
  @IsNumber()
  @IsLatitude()
  incidentLat?: number;

  @ValidateIf((value: SubmitReportDto) => value.incidentLat != null || value.incidentLng != null)
  @IsNumber()
  @IsLongitude()
  incidentLng?: number;
}

export class OwnReportListQueryDto {
  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit: number = 20;
}

export class ReviewWarehouseRequestDto {
  @IsString()
  @MinLength(1)
  warehouseId!: string;

  @IsString()
  @MinLength(1)
  sku!: string;

  @IsInt()
  @Min(1)
  quantity!: number;
}

export class ReviewReportDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  location?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  adminNote?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReviewWarehouseRequestDto)
  requests!: ReviewWarehouseRequestDto[];
}

export class WarehouseRequestNoteDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

/** ADMIN duyệt lại một yêu cầu kho sau khi kho báo thiếu/sai thông tin. */
export class AdminReviewWarehouseRequestDto {
  @IsInt()
  @Min(1)
  requestedQuantity!: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  adminNote?: string;
}

/** Lập phương án: parse rồi phân bổ, HOẶC truyền tình huống đã parse sẵn. */
export class GeneratePlanDto {
  @IsString()
  warehouseId!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  incidentLat?: number;

  @IsOptional()
  @IsNumber()
  incidentLng?: number;

  @IsOptional()
  incident?: {
    incidentType: string;
    affectedPeople: number;
    durationHours: number;
    children?: number;
    elderly?: number;
    medicalSupportCases?: number;
  };
}
