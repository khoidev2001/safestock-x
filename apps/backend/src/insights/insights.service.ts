import { Injectable, NotFoundException } from "@nestjs/common";
import { TransactionType } from "@prisma/client";
import { AiClientService } from "../ai/ai-client.service";
import { PrismaService } from "../prisma/prisma.service";
import { ReadinessService } from "../readiness/readiness.service";
import { computeExpiryAlerts } from "./expiry-alert";
import { computeForecast } from "./forecast";
import {
  buildDailyBriefingPriorities,
  buildDailyBriefingFacts,
  buildDailyBriefingTemplate,
  DailyBriefingSnapshot,
  narrativeUsesOnlySnapshotNumbers,
} from "./daily-briefing";
import { computeRebalanceSuggestions, WarehouseStock } from "./rebalance";
import { computeTrends } from "./trends";
import { WeatherService } from "./weather";
import { computeWeatherDemandForecast } from "./weather-demand";

const FORECAST_WINDOW_DAYS = 30;
const TRENDS_PERIOD_DAYS = 30;

@Injectable()
export class InsightsService {
  constructor(
    private prisma: PrismaService,
    private ai: AiClientService,
    private weather: WeatherService,
    private readinessService: ReadinessService,
  ) {}

  /** Tổng hợp insight 1 kho: dự báo cạn kho, cảnh báo hết hạn, đề xuất cân bằng, thời tiết. */
  async getWarehouseInsights(warehouseId: string) {
    const warehouse = await this.prisma.warehouse.findUnique({ where: { id: warehouseId } });
    if (!warehouse) throw new NotFoundException("Không tìm thấy kho");
    const now = new Date();

    const [stock, exportTxns, expiringBatches, clusterStock] = await Promise.all([
      this.currentStock(warehouseId),
      this.recentExports(warehouseId, FORECAST_WINDOW_DAYS, now),
      this.expiringBatches(warehouseId, warehouse.name),
      this.clusterStock(warehouse.communeId),
    ]);

    const forecast = computeForecast(exportTxns, stock, FORECAST_WINDOW_DAYS, now);
    const expiryAlerts = computeExpiryAlerts(expiringBatches, now);
    const rebalance = computeRebalanceSuggestions(clusterStock).filter(
      (r) => r.fromWarehouseId === warehouseId || r.toWarehouseId === warehouseId,
    );
    const weatherAlert =
      warehouse.lat != null && warehouse.lng != null
        ? await this.weather.forecastRain(warehouse.lat, warehouse.lng)
        : null;
    const metadataBySku = new Map(
      [...stock, ...exportTxns].map((item) => [
        item.sku,
        { categoryName: item.categoryName, unit: item.unit },
      ]),
    );
    const weatherDemand = computeWeatherDemandForecast(
      forecast.map((item) => ({
        ...item,
        categoryName: metadataBySku.get(item.sku)?.categoryName ?? "Chưa phân loại",
        unit: metadataBySku.get(item.sku)?.unit ?? "đơn vị",
      })),
      weatherAlert,
    );

    return { forecast, expiryAlerts, rebalance, weatherAlert, weatherDemand };
  }

  /** Báo cáo tháng: xu hướng xuất kho (thuần tính) + LLM diễn giải, fallback khi ai-service lỗi. */
  async getMonthlyReport(warehouseId: string) {
    const warehouse = await this.prisma.warehouse.findUnique({ where: { id: warehouseId } });
    if (!warehouse) throw new NotFoundException("Không tìm thấy kho");
    const now = new Date();

    const exportTxns = await this.recentExports(warehouseId, TRENDS_PERIOD_DAYS * 2, now);
    const trends = computeTrends(exportTxns, TRENDS_PERIOD_DAYS, now);

    let narrative: string;
    try {
      narrative = await this.ai.explain(buildTrendsContext(warehouse.name, trends));
    } catch {
      narrative = buildTemplateSummary(trends);
    }

    return { trends, narrative };
  }

  /** Bản tin đầu ngày: snapshot/số do backend tính; LLM chỉ diễn giải và bị kiểm số. */
  async getDailyBriefing(warehouseId: string) {
    const [insights, readiness, incidents, warehouse] = await Promise.all([
      this.getWarehouseInsights(warehouseId),
      this.readinessService.getWarehouseScore(warehouseId),
      this.prisma.incident.findMany({
        where: { warehouseId, state: { not: "RESOLVED" } },
        select: { severity: true },
      }),
      this.prisma.warehouse.findUnique({
        where: { id: warehouseId },
        select: { name: true },
      }),
    ]);
    if (!warehouse) throw new NotFoundException("Không tìm thấy kho");

    const snapshot: DailyBriefingSnapshot = {
      date: new Date().toISOString().slice(0, 10),
      warehouse,
      readiness: {
        score: readiness?.score ?? null,
        maxScore: 100,
        operationalStatus: readiness?.operationalStatus ?? null,
      },
      weather: insights.weatherAlert
        ? {
            totalRainMm: insights.weatherAlert.totalRainMm,
            periodHours: 72,
            alert: insights.weatherAlert.alert,
            horizons: insights.weatherAlert.horizons.map((item) => ({
              hours: item.hours,
              rainMm: item.rainMm,
              maxWindKph: item.maxWindKph,
            })),
          }
        : null,
      inventory: {
        lowStockCount: insights.forecast.filter((item) => item.lowStock).length,
        expiringBatchCount: insights.expiryAlerts.length,
        weatherRiskCount: insights.weatherDemand.filter((item) => item.atRisk).length,
      },
      incidents: {
        openCount: incidents.length,
        highOrCriticalCount: incidents.filter(
          (item) => item.severity === "HIGH" || item.severity === "CRITICAL",
        ).length,
      },
    };
    const priorities = buildDailyBriefingPriorities(snapshot, insights.weatherDemand);
    const fallback = buildDailyBriefingTemplate(snapshot);
    let narrative = fallback;
    let source: "AI" | "TEMPLATE" = "TEMPLATE";
    try {
      const facts = buildDailyBriefingFacts(snapshot);
      const selection = await this.ai.selectBriefingFacts(facts);
      const factById = new Map(facts.map((fact) => [fact.id, fact.text]));
      const generated = selection.factIds
        .map((id) => factById.get(id))
        .filter(Boolean)
        .join(" ");
      if (
        selection.factIds.length !== facts.length ||
        new Set(selection.factIds).size !== facts.length ||
        selection.factIds.some((id) => !factById.has(id)) ||
        !narrativeUsesOnlySnapshotNumbers(generated, snapshot)
      ) {
        throw new Error("AI briefing chứa số ngoài snapshot");
      }
      narrative = generated;
      source = "AI";
    } catch {
      // Bản tin rule-based vẫn dùng được khi LLM tắt hoặc vi phạm hợp đồng số.
    }
    return {
      generatedAt: new Date().toISOString(),
      source,
      snapshot,
      narrative,
      priorities,
    };
  }

  /** Tồn khả dụng theo SKU: IN_STOCK, TRỪ phần đang cho mượn (giống mission.loadClusterBatches). */
  private async currentStock(warehouseId: string) {
    const batches = await this.prisma.itemBatch.findMany({
      where: { shelf: { zone: { warehouseId } }, circulation: "IN_STOCK" },
      include: {
        item: { include: { category: true } },
        loans: { where: { status: { in: ["ON_LOAN", "PARTIALLY_RETURNED"] } } },
      },
    });

    const bySku = new Map<
      string,
      {
        sku: string;
        itemName: string;
        quantity: number;
        categoryName: string;
        unit: string;
      }
    >();
    for (const b of batches) {
      const onLoan = b.loans.reduce(
        (sum, loan) => sum + (loan.quantity - loan.returnedOk - loan.returnedDamaged - loan.lost),
        0,
      );
      const available = Math.max(0, b.quantity - onLoan);
      const entry = bySku.get(b.item.sku) ?? {
        sku: b.item.sku,
        itemName: b.item.name,
        quantity: 0,
        categoryName: b.item.category.name,
        unit: b.item.category.unit,
      };
      entry.quantity += available;
      bySku.set(b.item.sku, entry);
    }
    return [...bySku.values()];
  }

  private async recentExports(warehouseId: string, days: number, now: Date) {
    const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const txns = await this.prisma.inventoryTransaction.findMany({
      where: {
        type: TransactionType.EXPORT,
        createdAt: { gte: since },
        batch: { shelf: { zone: { warehouseId } } },
      },
      include: { batch: { include: { item: { include: { category: true } } } } },
    });
    return txns.map((t) => ({
      sku: t.batch.item.sku,
      itemName: t.batch.item.name,
      quantity: t.quantity,
      createdAt: t.createdAt,
      categoryName: t.batch.item.category.name,
      unit: t.batch.item.category.unit,
    }));
  }

  private async expiringBatches(warehouseId: string, warehouseName: string) {
    const batches = await this.prisma.itemBatch.findMany({
      where: {
        shelf: { zone: { warehouseId } },
        expiryDate: { not: null },
        circulation: "IN_STOCK",
      },
      include: { item: true },
    });
    return batches.map((b) => ({
      batchId: b.id,
      sku: b.item.sku,
      itemName: b.item.name,
      warehouseId,
      warehouseName,
      quantity: b.quantity,
      expiryDate: b.expiryDate as Date,
    }));
  }

  private async clusterStock(communeId: string): Promise<WarehouseStock[]> {
    const warehouses = await this.prisma.warehouse.findMany({ where: { communeId } });
    const batches = await this.prisma.itemBatch.findMany({
      where: {
        shelf: { zone: { warehouseId: { in: warehouses.map((w) => w.id) } } },
        circulation: "IN_STOCK",
      },
      include: {
        item: true,
        shelf: { include: { zone: true } },
        loans: { where: { status: { in: ["ON_LOAN", "PARTIALLY_RETURNED"] } } },
      },
    });
    const nameById = new Map(warehouses.map((w) => [w.id, w.name]));

    const bySkuWarehouse = new Map<string, WarehouseStock>();
    for (const b of batches) {
      if (!b.shelf) continue;
      const onLoan = b.loans.reduce(
        (sum, loan) => sum + (loan.quantity - loan.returnedOk - loan.returnedDamaged - loan.lost),
        0,
      );
      const wid = b.shelf.zone.warehouseId;
      const key = `${b.item.sku}::${wid}`;
      const entry = bySkuWarehouse.get(key) ?? {
        warehouseId: wid,
        warehouseName: nameById.get(wid) ?? wid,
        sku: b.item.sku,
        itemName: b.item.name,
        quantity: 0,
      };
      entry.quantity += Math.max(0, b.quantity - onLoan);
      bySkuWarehouse.set(key, entry);
    }
    return [...bySkuWarehouse.values()];
  }
}

function buildTrendsContext(
  warehouseName: string,
  trends: ReturnType<typeof computeTrends>,
): string {
  const lines = trends.map(
    (t) =>
      `- ${t.itemName}: kỳ này ${t.currentTotal}, kỳ trước ${t.previousTotal}` +
      (t.changePercent != null
        ? ` (${t.changePercent >= 0 ? "+" : ""}${t.changePercent.toFixed(0)}%)`
        : " (mới)"),
  );
  return [
    `BÁO CÁO XU HƯỚNG XUẤT KHO — ${warehouseName}, ${TRENDS_PERIOD_DAYS} ngày gần nhất:`,
    ...lines,
  ].join("\n");
}

function buildTemplateSummary(trends: ReturnType<typeof computeTrends>): string {
  if (trends.length === 0) return "Chưa có giao dịch xuất kho trong kỳ để phân tích xu hướng.";
  // "mới" = kỳ trước 0, kỳ này >0 (changePercent null). Đếm riêng để rising+falling+mới+ổn định = tổng.
  const isNew = (t: (typeof trends)[number]) => t.changePercent == null && t.currentTotal > 0;
  const rising = trends.filter((t) => (t.changePercent ?? 0) > 0).length;
  const falling = trends.filter((t) => (t.changePercent ?? 0) < 0).length;
  const fresh = trends.filter(isNew).length;
  const parts = [`${rising} mặt hàng tăng`, `${falling} mặt hàng giảm`];
  if (fresh > 0) parts.push(`${fresh} mặt hàng mới phát sinh`);
  return `Kỳ này có ${trends.length} mặt hàng phát sinh xuất kho: ${parts.join(", ")} so kỳ trước.`;
}
