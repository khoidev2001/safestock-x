import { IsIn, IsNumber, IsOptional, IsString, MinLength } from "class-validator";
import { DeliveryOutcome } from "@prisma/client";

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

/** Đội cứu hộ từ chối nhiệm vụ — bắt buộc nêu lý do (admin xem xét sau). */
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

/** Đội cứu hộ xác nhận kết quả giao (READY → COMPLETED) — kèm ghi chú tuỳ chọn. */
export class CompleteMissionDto {
  @IsIn(Object.values(DeliveryOutcome))
  outcome!: DeliveryOutcome;

  @IsOptional()
  @IsString()
  note?: string;
}

/** Lập phương án: parse rồi phân bổ, HOẶC truyền tình huống đã parse sẵn. */
export class GeneratePlanDto {
  @IsString()
  warehouseId!: string;

  // Cách 1: mô tả text → backend gọi AI parse.
  @IsOptional()
  @IsString()
  description?: string;

  // Toạ độ điểm nạn (ghim tay) — chọn kho gần nhất trong cụm xã.
  @IsOptional()
  @IsNumber()
  incidentLat?: number;

  @IsOptional()
  @IsNumber()
  incidentLng?: number;

  // Cách 2: tình huống đã có cấu trúc (bỏ qua AI — nhập tay / test).
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
