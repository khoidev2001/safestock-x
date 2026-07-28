import { HttpException, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ActionPlanNarrative } from "../mission/action-plan";
import { IncidentInput } from "../mission/mission.compute";

/**
 * Client gọi ai-service (FastAPI). Có CACHE parse (D1b) — câu demo cố định trả
 * ngay, không phụ thuộc Gemini rate-limit/mạng hội trường. Đây là demo an toàn,
 * không phải gian lận.
 */
@Injectable()
export class AiClientService {
  private readonly log = new Logger(AiClientService.name);
  private readonly baseUrl: string;
  private parseCache = new Map<string, IncidentInput>();
  private actionPlanCache = new Map<string, ActionPlanNarrative>();

  constructor(config: ConfigService) {
    this.baseUrl = config.get("AI_SERVICE_URL") ?? "http://localhost:8000";
  }

  /** Parse mô tả → tình huống. Cache theo mô tả (chuẩn hóa). */
  async parse(description: string): Promise<IncidentInput> {
    const key = description.trim().toLowerCase();
    const cached = this.parseCache.get(key);
    if (cached) return cached;

    const result = await this.post<IncidentInput>("/parse", { description });
    this.parseCache.set(key, result);
    return result;
  }

  /** Giải thích phương án (đã tính) bằng tiếng Việt. */
  async explain(context: string): Promise<string> {
    const result = await this.post<{ explanation: string }>("/explain", { context });
    return result.explanation;
  }

  /** Hỏi-đáp kho: LLM trả lời chỉ dựa trên snapshot JSON (backend chụp), ngoài phạm vi → "không biết". */
  async assistantAsk(question: string, snapshot: string): Promise<string> {
    const result = await this.post<{ answer: string }>("/assistant", { question, snapshot });
    return result.answer;
  }

  /** Nhận dạng giọng nói (WAV base64) → text tiếng Việt bằng PhoWhisper local. Không cache. */
  async transcribe(audioBase64: string, mimeType: string): Promise<{ text: string }> {
    const result = await this.post<unknown>("/transcribe", { audioBase64, mimeType });
    if (!isTranscriptionResult(result)) {
      throw new HttpException("AI service trả dữ liệu phiên âm không hợp lệ", 502);
    }
    return result;
  }

  /**
   * Sinh phần diễn giải Action Plan (mục tiêu/giai đoạn/cảnh báo/câu hỏi).
   * Context là số ĐÃ TÍNH (severity/forecasts/vật tư/kho/ETA). Có cache theo context.
   * Ném lỗi nếu LLM/mạng hỏng → service tự dùng template fallback.
   */
  async actionPlanNarrative(context: string): Promise<ActionPlanNarrative> {
    const key = context.trim();
    const cached = this.actionPlanCache.get(key);
    if (cached) return cached;

    const result = await this.post<ActionPlanNarrative>("/action-plan", { context });
    this.actionPlanCache.set(key, result);
    return result;
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const detail = await response.text();
        throw new HttpException(`AI service lỗi: ${detail}`, response.status);
      }
      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.log.error(`Gọi ai-service thất bại: ${(error as Error).message}`);
      throw new HttpException("Không kết nối được AI service", 503);
    }
  }
}

function isTranscriptionResult(value: unknown): value is { text: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "text" in value &&
    typeof value.text === "string"
  );
}
