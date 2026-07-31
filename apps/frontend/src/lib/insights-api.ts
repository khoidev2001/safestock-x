import { apiFetch } from "./api";

export interface ForecastItem {
  sku: string;
  itemName: string;
  quantity: number;
  avgPerDay: number;
  ewmaPerDay: number;
  dailyStdDev: number;
  daysLeft: number | null;
  daysLeftLow: number | null;
  daysLeftHigh: number | null;
  reorderPoint: number;
  confidence: number;
  lowStock: boolean;
}

export interface ExpiryAlertItem {
  batchId: string;
  sku: string;
  itemName: string;
  warehouseName: string;
  quantity: number;
  expiryDate: string;
  daysUntilExpiry: number;
}

export interface RebalanceItem {
  sku: string;
  fromWarehouseName: string;
  toWarehouseName: string;
  suggestedQty: number;
}

export interface WeatherAlert {
  totalRainMm: number;
  alert: boolean;
  periodHours: 72;
  daily: { date: string; precipitationMm: number }[];
  fetchedAt: string;
  source: "open-meteo";
  cached?: boolean;
  stale?: boolean;
}

export interface WeatherDemandItem {
  sku: string;
  itemName: string;
  categoryName: string;
  unit: string;
  group: string;
  currentQuantity: number;
  baselineDemand72h: number;
  projectedDemand72h: number;
  additionalDemandFromRain: number;
  shortage: number;
  demandFactor: number;
  confidence: number;
  dataSufficient: boolean;
  atRisk: boolean;
}

export interface WarehouseInsights {
  forecast: ForecastItem[];
  expiryAlerts: ExpiryAlertItem[];
  rebalance: RebalanceItem[];
  weatherAlert: WeatherAlert | null;
  weatherDemand: WeatherDemandItem[];
}

export interface TrendItem {
  sku: string;
  itemName: string;
  currentTotal: number;
  previousTotal: number;
  changePercent: number | null;
}

export interface MonthlyReport {
  trends: TrendItem[];
  narrative: string;
}

export interface DailyBriefing {
  generatedAt: string;
  source: "AI" | "TEMPLATE";
  snapshot: {
    date: string;
    warehouse: { name: string };
    readiness: {
      score: number | null;
      maxScore: 100;
      operationalStatus: string | null;
    };
    weather: { totalRainMm: number; periodHours: 72; alert: boolean } | null;
    inventory: {
      lowStockCount: number;
      expiringBatchCount: number;
      weatherRiskCount: number;
    };
    incidents: { openCount: number; highOrCriticalCount: number };
  };
  narrative: string;
  priorities: string[];
}

export function getWarehouseInsights(warehouseId: string): Promise<WarehouseInsights> {
  return apiFetch<WarehouseInsights>(`/api/insights/warehouses/${warehouseId}`);
}

export function getMonthlyReport(warehouseId: string): Promise<MonthlyReport> {
  return apiFetch<MonthlyReport>(`/api/insights/warehouses/${warehouseId}/monthly-report`);
}

export function getDailyBriefing(warehouseId: string): Promise<DailyBriefing> {
  return apiFetch<DailyBriefing>(`/api/insights/warehouses/${warehouseId}/daily-briefing`);
}
