import { ForecastResult } from "./forecast";
import { WeatherAlert } from "./weather";

export type ReliefDemandGroup =
  | "WASH"
  | "RESCUE"
  | "FOOD"
  | "SHELTER"
  | "HEALTH"
  | "COMMUNICATION"
  | "OTHER";

export interface WeatherDemandInput extends ForecastResult {
  categoryName: string;
  unit: string;
}

export interface WeatherDemandForecast {
  sku: string;
  itemName: string;
  categoryName: string;
  unit: string;
  group: ReliefDemandGroup;
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

const MODERATE_RAIN_FACTORS: Record<ReliefDemandGroup, number> = {
  WASH: 1.6,
  RESCUE: 1.5,
  FOOD: 1.35,
  SHELTER: 1.3,
  HEALTH: 1.15,
  COMMUNICATION: 1.2,
  OTHER: 1,
};

const SEVERE_RAIN_FACTORS: Record<ReliefDemandGroup, number> = {
  WASH: 2,
  RESCUE: 1.8,
  FOOD: 1.6,
  SHELTER: 1.5,
  HEALTH: 1.25,
  COMMUNICATION: 1.3,
  OTHER: 1,
};

/**
 * Dự báo nhu cầu 72 giờ minh bạch:
 * baseline = EWMA/ngày × 3; khi Open-Meteo cảnh báo mưa ≥100 mm thì nhân hệ số
 * theo nhóm cứu trợ. LLM chỉ được diễn giải kết quả này, không tự đổi hệ số.
 */
export function computeWeatherDemandForecast(
  forecast: WeatherDemandInput[],
  weather: WeatherAlert | null,
): WeatherDemandForecast[] {
  const factors =
    weather?.alert === true
      ? weather.totalRainMm >= 200
        ? SEVERE_RAIN_FACTORS
        : MODERATE_RAIN_FACTORS
      : null;

  return forecast
    .map((item) => {
      const group = classifyDemandGroup(item);
      const demandFactor = factors?.[group] ?? 1;
      const baselineDemand72h = Math.ceil(Math.max(0, item.ewmaPerDay) * 3);
      const projectedDemand72h = Math.ceil(baselineDemand72h * demandFactor);
      const shortage = Math.max(0, projectedDemand72h - item.quantity);
      const dataSufficient = item.ewmaPerDay > 0 && item.confidence >= 0.25;

      return {
        sku: item.sku,
        itemName: item.itemName,
        categoryName: item.categoryName,
        unit: item.unit,
        group,
        currentQuantity: item.quantity,
        baselineDemand72h,
        projectedDemand72h,
        additionalDemandFromRain: projectedDemand72h - baselineDemand72h,
        shortage,
        demandFactor,
        confidence: item.confidence,
        dataSufficient,
        atRisk: demandFactor > 1 && dataSufficient && shortage > 0,
      };
    })
    .filter((item) => item.demandFactor > 1)
    .sort(
      (left, right) =>
        Number(right.atRisk) - Number(left.atRisk) ||
        right.shortage - left.shortage ||
        left.sku.localeCompare(right.sku),
    );
}

export function classifyDemandGroup(item: {
  sku: string;
  itemName: string;
  categoryName: string;
}): ReliefDemandGroup {
  const haystack = normalize(`${item.sku} ${item.itemName} ${item.categoryName}`);
  if (matches(haystack, ["water", "hygiene", "nuoc", "ve sinh"])) return "WASH";
  if (matches(haystack, ["life", "boat", "rope", "cuu sinh", "cuu ho", "ao phao", "xuong"]))
    return "RESCUE";
  if (matches(haystack, ["rice", "food", "gao", "luong thuc", "thuc pham"])) return "FOOD";
  if (matches(haystack, ["canvas", "blanket", "mosquito", "chan", "man", "che chan"]))
    return "SHELTER";
  if (matches(haystack, ["firstaid", "y te", "so cuu"])) return "HEALTH";
  if (
    matches(haystack, [
      "torch",
      "batt",
      "radio",
      "powerbank",
      "chieu sang",
      "pin",
      "lien lac",
      "nguon dien",
    ])
  )
    return "COMMUNICATION";
  return "OTHER";
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .toLowerCase();
}

function matches(haystack: string, needles: string[]): boolean {
  return needles.some((needle) => haystack.includes(needle));
}
