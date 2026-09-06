import { Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { IncidentState } from "@prisma/client";
import { AiClientService } from "../ai/ai-client.service";
import { WeatherService } from "../insights/weather";
import { PrismaService } from "../prisma/prisma.service";
import { ReadinessService } from "../readiness/readiness.service";
import {
  detectEmergencySignal,
  resolveEmergencyAnswer,
  type EmergencySignal,
} from "./assistant-emergency-answer";
import {
  type AssistantSnapshot,
  isWeatherQuestion,
  resolveAssistantFastAnswer,
} from "./assistant-fast-answer";

export interface AssistantAnswer {
  answer: string;
  /** Có khi câu hỏi mô tả một sự việc cần điều phối. */
  emergency?: EmergencySignal;
}

/**
 * Trợ lý ứng phó: trả lời tức thời các tình huống cứu hộ phổ biến, đồng thời dùng snapshot
 * kho cho câu hỏi tồn/mức sẵn sàng/sự cố. LLM không tự tra DB hoặc tự bịa số liệu.
 */
@Injectable()
export class AssistantService {
  constructor(
    private prisma: PrismaService,
    private ai: AiClientService,
    private readiness: ReadinessService,
    private weather: WeatherService,
  ) {}

  async ask(warehouseId: string, question: string): Promise<AssistantAnswer> {
    // Kèm tín hiệu khẩn cấp để giao diện mời sang luồng điều phối. Nhận diện là
    // luật cố định (từ khoá + số người), không phải AI đoán — mời sai chỗ thì
    // người dùng mất niềm tin vào chính lời mời đó.
    const emergency = detectEmergencySignal(question);
    if (emergency) return this.answerEmergency(warehouseId, question, emergency);

    const snapshot = await this.buildSnapshot(warehouseId, isWeatherQuestion(question));
    const fastAnswer = resolveAssistantFastAnswer(question, snapshot);
    if (fastAnswer) return { answer: fastAnswer };

    try {
      const answer = await this.ai.assistantAsk(question, JSON.stringify(snapshot));
      return { answer };
    } catch {
      throw new ServiceUnavailableException("Trợ lý AI tạm thời không phản hồi. Thử lại sau.");
    }
  }

  /**
   * Hỏi-đáp theo DÒNG CHỮ, cùng luật với `ask` chứ không phải một đường riêng.
   *
   * Ba nhánh trả lời tức thời (khẩn cấp, câu hỏi trả nhanh, đường lui khi AI chết)
   * vẫn giữ nguyên; chúng chỉ phát ra một mẩu duy nhất rồi đóng. Nếu tách hẳn hai
   * đường thì cùng một câu hỏi sẽ nhận hai câu trả lời khác nhau tuỳ giao diện gọi
   * đường nào — đó là lúc người trực hết tin vào trợ lý.
   */
  async *askStream(warehouseId: string, question: string): AsyncGenerator<string> {
    const emergency = detectEmergencySignal(question);

    let snapshot: AssistantSnapshot;
    try {
      snapshot = await this.buildSnapshot(
        warehouseId,
        emergency ? true : isWeatherQuestion(question),
      );
    } catch (error) {
      // Kho không tồn tại là lỗi của người gọi, phải nói thẳng. Còn lại thì sự cố
      // vẫn có đường lui.
      if (error instanceof NotFoundException) throw error;
      const fallback = emergency ? resolveEmergencyAnswer(question) : null;
      if (!fallback)
        throw new ServiceUnavailableException("Trợ lý AI tạm thời không phản hồi. Thử lại sau.");
      yield JSON.stringify({ emergency });
      yield JSON.stringify({ delta: fallback });
      return;
    }

    if (emergency) yield JSON.stringify({ emergency });
    else {
      const fastAnswer = resolveAssistantFastAnswer(question, snapshot);
      if (fastAnswer) {
        yield JSON.stringify({ delta: fastAnswer });
        return;
      }
    }

    let hasText = false;
    try {
      for await (const event of this.ai.assistantStream(question, JSON.stringify(snapshot))) {
        if (event === "[DONE]") break;
        if (event.includes('"delta"')) hasText = true;
        yield event;
      }
    } catch {
      // Đứt giữa chừng: đã có chữ trên màn hình thì đừng xoá đi, người đọc mất
      // luôn phần đã đọc. Chưa có chữ nào mới được phép thay bằng đường lui.
      const fallback = emergency ? resolveEmergencyAnswer(question) : null;
      if (!hasText && fallback) yield JSON.stringify({ delta: fallback });
      else yield JSON.stringify({ error: "Trợ lý AI tạm thời không phản hồi. Thử lại sau." });
    }
  }

  /**
   * Trả lời một sự việc cần cứu hộ: để AI đọc tình huống trên nền tồn kho thật.
   *
   * Trước đây nhánh này chặn ngay bằng câu dựng sẵn, nên trợ lý trả lời giống hệt
   * nhau cho mọi sự việc — đúng nhưng vô hồn, và không hề dùng tới số vật tư đang
   * có trong kho.
   *
   * Bản mẫu vẫn giữ nguyên, chỉ lùi về đúng vai: ĐƯỜNG LUI. Cả việc chụp trạng
   * thái kho lẫn lượt gọi AI đều nằm trong cùng một `try`, nên mất điện, mất mạng,
   * hay cơ sở dữ liệu chết thì người trực vẫn nhận được câu trả lời dùng được —
   * đó là lúc cần nó nhất, không phải lúc mọi thứ đang chạy tốt.
   */
  private async answerEmergency(
    warehouseId: string,
    question: string,
    emergency: EmergencySignal,
  ): Promise<AssistantAnswer> {
    try {
      // Khẩn cấp thì LUÔN kèm thời tiết: mưa quyết định cách tiếp cận và vật tư,
      // không đợi người dùng hỏi mới lấy.
      const snapshot = await this.buildSnapshot(warehouseId, true);
      const answer = await this.ai.assistantAsk(question, JSON.stringify(snapshot));
      return { answer, emergency };
    } catch {
      const fallback = resolveEmergencyAnswer(question);
      if (fallback) return { answer: fallback, emergency };
      throw new ServiceUnavailableException("Trợ lý AI tạm thời không phản hồi. Thử lại sau.");
    }
  }

  /** Chụp trạng thái kho gọn cho LLM: tồn theo SKU (trừ mượn), readiness, sự cố đang mở. */
  private async buildSnapshot(
    warehouseId: string,
    includeWeather: boolean,
  ): Promise<AssistantSnapshot> {
    const warehouse = await this.prisma.warehouse.findUnique({ where: { id: warehouseId } });
    if (!warehouse) throw new NotFoundException("Không tìm thấy kho");

    const [batches, storedScore, incidents, weather] = await Promise.all([
      this.prisma.itemBatch.findMany({
        where: { shelf: { zone: { warehouseId } }, circulation: "IN_STOCK" },
        include: {
          item: { include: { category: true } },
          loans: { where: { status: { in: ["ON_LOAN", "PARTIALLY_RETURNED"] } } },
        },
      }),
      this.readiness.getWarehouseScore(warehouseId),
      this.prisma.incident.findMany({
        where: { warehouseId, state: { not: IncidentState.RESOLVED } },
        select: { kind: true, severity: true, title: true, state: true },
      }),
      includeWeather && warehouse.lat != null && warehouse.lng != null
        ? this.weather.forecastRain(warehouse.lat, warehouse.lng)
        : Promise.resolve(null),
    ]);
    let score = storedScore;
    if (!score) {
      await this.readiness.recalculateWarehouse(warehouseId);
      score = await this.readiness.getWarehouseScore(warehouseId);
    }

    const stockBySku = new Map<
      string,
      { itemName: string; unit: string; quantity: number; expiryDate: Date | null }
    >();
    for (const b of batches) {
      const onLoan = b.loans.reduce(
        (sum, l) => sum + (l.quantity - l.returnedOk - l.returnedDamaged - l.lost),
        0,
      );
      const available = Math.max(0, b.quantity - onLoan);
      const entry = stockBySku.get(b.item.sku) ?? {
        itemName: b.item.name,
        unit: b.item.category.unit,
        quantity: 0,
        expiryDate: b.expiryDate,
      };
      entry.quantity += available;
      // Giữ hạn dùng gần nhất cho SKU (cảnh báo sớm).
      if (b.expiryDate && (!entry.expiryDate || b.expiryDate < entry.expiryDate)) {
        entry.expiryDate = b.expiryDate;
      }
      stockBySku.set(b.item.sku, entry);
    }

    return {
      warehouse: { name: warehouse.name, commune: warehouse.communeId },
      readiness: score
        ? {
            score: score.score,
            zone: score.zone,
            operationalStatus: score.operationalStatus,
            blockers: score.blockers.map((blocker) => ({
              title: blocker.title,
              reasons: blocker.reasons,
            })),
            recommendedActions: score.recommendedActions,
          }
        : null,
      weather: weather ? { ...weather, periodHours: 72 } : null,
      stock: [...stockBySku.entries()]
        .map(([sku, s]) => ({
          sku,
          itemName: s.itemName,
          quantity: s.quantity,
          unit: s.unit,
          nearestExpiry: s.expiryDate ? s.expiryDate.toISOString().slice(0, 10) : null,
        }))
        .sort((left, right) =>
          (left.nearestExpiry ?? "9999-12-31").localeCompare(right.nearestExpiry ?? "9999-12-31"),
        ),
      openIncidents: incidents,
    };
  }
}
