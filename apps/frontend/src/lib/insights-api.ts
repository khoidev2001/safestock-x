import { apiFetch } from "./api";

export interface ForecastItem {
  sku: string;
  itemName: string;
  quantity: number;
  avgPerDay: number;
  daysLeft: number | null;
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
}

export interface WarehouseInsights {
  forecast: ForecastItem[];
  expiryAlerts: ExpiryAlertItem[];
  rebalance: RebalanceItem[];
  weatherAlert: WeatherAlert | null;
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

export function getWarehouseInsights(warehouseId: string): Promise<WarehouseInsights> {
  return apiFetch<WarehouseInsights>(`/api/insights/warehouses/${warehouseId}`);
}

export function getMonthlyReport(warehouseId: string): Promise<MonthlyReport> {
  return apiFetch<MonthlyReport>(`/api/insights/warehouses/${warehouseId}/monthly-report`);
}
