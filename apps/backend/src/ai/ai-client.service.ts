import { HttpException, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { FieldUpdateIntent, SituationExtraction } from "@safestock/shared-types";
import { randomUUID } from "crypto";
import { ActionPlanNarrative } from "../mission/action-plan";
import { IncidentInput } from "../mission/mission.compute";

/**
 * Client gọi ai-service (FastAPI). Có CACHE parse (D1b) — câu demo cố định trả
 * ngay, không phụ thuộc Gemini rate-limit/mạng hội trường. Đây là demo an toàn,
 * không phải gian lận.
 */
// Cache demo có giới hạn: nhập liệu tuỳ ý (mô tả, context) không được để Map phình vô hạn
// → rò rỉ bộ nhớ theo thời gian chạy dài. Vượt ngưỡng thì loại bỏ khoá cũ nhất (FIFO/LRU thô).
const MAX_CACHE_ENTRIES = 200;
// Chặn treo request khi ai-service chậm/mạng hội trường kém: quá hạn thì huỷ và fallback.
const DEFAULT_TIMEOUT_MS = 15_000;

@Injectable()
export class AiClientService {
  private readonly log = new Logger(AiClientService.name);
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private parseCache = new Map<string, IncidentInput>();
  private actionPlanCache = new Map<string, ActionPlanNarrative>();

  constructor(config: ConfigService) {
    this.baseUrl = config.get("AI_SERVICE_URL") ?? "http://localhost:8000";
    const configured = Number(config.get("AI_SERVICE_TIMEOUT_MS"));
    this.timeoutMs =
      Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_TIMEOUT_MS;
  }

  /** Ghi cache có chặn kích thước: quá ngưỡng thì bỏ khoá cũ nhất để tránh rò rỉ bộ nhớ. */
  private cacheSet<V>(cache: Map<string, V>, key: string, value: V): void {
    if (cache.size >= MAX_CACHE_ENTRIES) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
    cache.set(key, value);
  }

  /** Parse mô tả → tình huống. Cache theo mô tả (chuẩn hóa). */
  async parse(description: string): Promise<IncidentInput> {
    const key = description.trim().toLowerCase();
    const cached = this.parseCache.get(key);
    if (cached) return cached;

    const result = await this.post<IncidentInput>("/parse", { description });
    this.cacheSet(this.parseCache, key, result);
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

  /** Nhận dạng giọng nói (WAV base64) → text tiếng Việt bằng PhoWhisper local. Không cache (audio khác nhau mỗi lần). */
  async transcribe(audioBase64: string, mimeType: string): Promise<string> {
    const result = await this.post<{ text: string }>("/transcribe", { audioBase64, mimeType });
    return result.text;
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
    this.cacheSet(this.actionPlanCache, key, result);
    return result;
  }

  /**
   * NLP-only extraction for coordination. Inventory, routes, forecasts and
   * allocation remain backend-owned and are never accepted from this response.
   */
  async analyzeSituation(input: {
    description: string;
    sourceId: string;
    sourceType: "USER_REPORT" | "FIELD_UPDATE";
    capturedAt?: string | null;
  }): Promise<SituationExtraction> {
    return this.post<SituationExtraction>("/situation-analysis", input);
  }

  /**
   * Classifies an operator-confirmed field update into review-required intent
   * and source-grounded facts. It cannot calculate or mutate operations.
   */
  async analyzeFieldUpdateIntent(input: {
    confirmedText: string;
    sourceId: string;
    capturedAt?: string | null;
  }): Promise<FieldUpdateIntent> {
    return this.post<FieldUpdateIntent>("/field-update-intent", input);
  }

  /** Xếp hạng catalog bằng embedding local. Chỉ gửi ID + văn bản mô tả, không gửi tồn kho. */
  async semanticRank(
    query: string,
    candidates: { id: string; text: string }[],
    options: { topK?: number; minScore?: number } = {},
  ): Promise<{
    available: boolean;
    reason?: string | null;
    hits: { id: string; score: number }[];
  }> {
    return this.post("/semantic/rank", {
      query,
      candidates,
      topK: options.topK ?? 5,
      minScore: options.minScore ?? 0.35,
    });
  }

  /** AI chỉ xếp thứ tự fact đã kiểm chứng; không được sinh câu hoặc số mới. */
  async selectBriefingFacts(facts: { id: string; text: string }[]): Promise<{ factIds: string[] }> {
    return this.post("/briefing/select", { facts });
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const correlationId = randomUUID();
    const startedAt = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Correlation-ID": correlationId,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!response.ok) {
        this.log.warn(
          JSON.stringify({
            event: "ai_request",
            operation: path,
            correlationId,
            durationMs: Date.now() - startedAt,
            outcome: "http_error",
            status: response.status,
          }),
        );
        // Provider details can contain prompt text, transcripts, phone numbers
        // or tokens. They are deliberately neither logged nor returned.
        throw new HttpException("AI service không xử lý được yêu cầu", response.status);
      }
      const result = (await response.json()) as T;
      this.log.log(
        JSON.stringify({
          event: "ai_request",
          operation: path,
          correlationId,
          durationMs: Date.now() - startedAt,
          outcome: "success",
          status: response.status ?? 200,
        }),
      );
      return result;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.log.error(
        JSON.stringify({
          event: "ai_request",
          operation: path,
          correlationId,
          durationMs: Date.now() - startedAt,
          outcome: "network_error",
          errorClass:
            error != null && typeof error === "object" && "name" in error
              ? String(error.name).slice(0, 80)
              : "UnknownError",
        }),
      );
      throw new HttpException("Không kết nối được AI service", 503);
    } finally {
      clearTimeout(timeout);
    }
  }
}
