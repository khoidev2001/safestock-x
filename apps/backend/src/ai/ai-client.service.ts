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
// Với dòng chữ đang chảy thì đây là hạn IM LẶNG giữa hai mẩu chữ, không phải hạn
// tổng. Để rộng vì mô hình chạy trên card dùng chung với nhận dạng giọng nói, lúc
// card đầy thì mẩu chữ ra thưa hẳn.
const STREAM_IDLE_TIMEOUT_MS = 60_000;

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

  /**
   * Hỏi-đáp kho theo DÒNG CHỮ: trả từng mẩu chữ ngay khi mô hình sinh ra.
   *
   * Hạn giờ ở đây là hạn CHỜ IM LẶNG, không phải hạn tổng. Dùng hạn tổng thì câu
   * trả lời dài bị cắt ngang giữa chừng dù mô hình vẫn đang chạy tốt — người trực
   * nhận nửa câu còn tệ hơn nhận chậm. Cứ có mẩu chữ mới là đồng hồ đặt lại; chỉ
   * khi mô hình im quá lâu mới coi là chết.
   *
   * Sự kiện đi qua nguyên vẹn, backend KHÔNG diễn giải: lớp chống bịa số nằm ở
   * ai-service và nó gửi `replace` khi cần thay cả câu.
   */
  async *assistantStream(question: string, snapshot: string): AsyncGenerator<string> {
    const abort = new AbortController();
    let idleTimer: NodeJS.Timeout | undefined;
    const resetIdleTimer = () => {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => abort.abort(), STREAM_IDLE_TIMEOUT_MS);
    };

    resetIdleTimer();
    try {
      const res = await fetch(`${this.baseUrl}/assistant/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, snapshot }),
        signal: abort.signal,
      });
      if (!res.ok || !res.body) {
        throw new HttpException(
          `ai-service /assistant/stream lỗi ${res.status}`,
          res.status || 503,
        );
      }

      const decoder = new TextDecoder();
      let pending = "";
      for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
        resetIdleTimer();
        pending += decoder.decode(chunk, { stream: true });
        // SSE ngăn cách bằng dòng trống. Mẩu cuối chưa trọn thì GIỮ LẠI chờ khối
        // sau — cắt giữa một sự kiện là đưa ra JSON hỏng.
        const parts = pending.split("\n\n");
        pending = parts.pop() ?? "";
        for (const part of parts) {
          const line = part.trim();
          if (line.startsWith("data:")) yield line.slice(5).trim();
        }
      }
    } finally {
      if (idleTimer) clearTimeout(idleTimer);
    }
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
        //
        // Ngoại lệ 503: Ollama sinh văn bản mỗi lần một yêu cầu trên một GPU, nên
        // bấm đúng lúc có việc nền đang chạy là phải xếp hàng và có thể quá hạn.
        // Câu chung chung "không xử lý được yêu cầu" đẩy người dùng đi kiểm tra
        // dịch vụ, trong khi việc cần làm chỉ là chờ vài giây rồi bấm lại. Trạng
        // thái bận không phải thông tin nhạy cảm.
        throw new HttpException(
          response.status === 503
            ? "Mô hình AI đang bận xử lý yêu cầu khác. Chờ vài giây rồi bấm lại."
            : "AI service không xử lý được yêu cầu",
          response.status,
        );
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
