import { Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { IncidentState } from "@prisma/client";
import { AiClientService } from "../ai/ai-client.service";
import { WeatherService } from "../insights/weather";
import { PrismaService } from "../prisma/prisma.service";
import { ReadinessService } from "../readiness/readiness.service";
import { resolveEmergencyAnswer } from "./assistant-emergency-answer";
import {
  type AssistantSnapshot,
  isWeatherQuestion,
  resolveAssistantFastAnswer,
} from "./assistant-fast-answer";

/**
 * Trợ lý ứng phó: trả lời tức thời các tình huống cứu hộ phổ biến, đồng thời dùng snapshot
 * kho cho câu hỏi tồn/readiness/sự cố. LLM không tự tra DB hoặc tự bịa số liệu.
 */
@Injectable()
export class AssistantService {
  constructor(
    private prisma: PrismaService,
    private ai: AiClientService,
    private readiness: ReadinessService,
    private weather: WeatherService,
  ) {}

  async ask(warehouseId: string, question: string): Promise<{ answer: string }> {
    const emergencyAnswer = resolveEmergencyAnswer(question);
    if (emergencyAnswer) return { answer: emergencyAnswer };

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
