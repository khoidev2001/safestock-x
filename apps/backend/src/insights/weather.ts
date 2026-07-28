import { Injectable, Logger } from "@nestjs/common";

const RAIN_ALERT_MM_72H = 100;
const FRESH_CACHE_MS = 10 * 60 * 1000;
const STALE_FALLBACK_MS = 6 * 60 * 60 * 1000;

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

/**
 * Cảnh báo mưa lớn 72h tới từ Open-Meteo (free, không cần key).
 * Lỗi mạng / kho chưa ghim toạ độ → trả null, KHÔNG throw chặn insights tổng hợp.
 */
@Injectable()
export class WeatherService {
  private readonly log = new Logger(WeatherService.name);
  private readonly cache = new Map<
    string,
    { value: WeatherAlert; storedAt: number }
  >();
  private readonly inFlight = new Map<string, Promise<WeatherAlert | null>>();

  async forecastRain(lat: number, lng: number): Promise<WeatherAlert | null> {
    const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.storedAt <= FRESH_CACHE_MS) {
      return { ...cached.value, cached: true, stale: false };
    }
    const currentRequest = this.inFlight.get(key);
    if (currentRequest) return currentRequest;

    const request = this.loadForecast(lat, lng, cached)
      .then((value) => {
        if (value && !value.stale) {
          this.cache.set(key, { value, storedAt: Date.now() });
        }
        return value;
      })
      .finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, request);
    return request;
  }

  private async loadForecast(
    lat: number,
    lng: number,
    cached?: { value: WeatherAlert; storedAt: number },
  ): Promise<WeatherAlert | null> {
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=precipitation_sum&forecast_days=3&timezone=auto`;
      const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = (await response.json()) as {
        daily?: { time?: string[]; precipitation_sum?: number[] };
      };
      const precipitation = data.daily?.precipitation_sum ?? [];
      const dates = data.daily?.time ?? [];
      const totalRainMm = precipitation.reduce(
        (sum, v) => sum + (v ?? 0),
        0,
      );
      return {
        totalRainMm: Math.round(totalRainMm * 10) / 10,
        alert: totalRainMm >= RAIN_ALERT_MM_72H,
        periodHours: 72,
        daily: precipitation.map((value, index) => ({
          date: dates[index] ?? "",
          precipitationMm: value ?? 0,
        })),
        fetchedAt: new Date().toISOString(),
        source: "open-meteo",
        cached: false,
        stale: false,
      };
    } catch (error) {
      this.log.warn(`Open-Meteo lỗi: ${(error as Error).message}`);
      if (cached && Date.now() - cached.storedAt <= STALE_FALLBACK_MS) {
        return { ...cached.value, cached: true, stale: true };
      }
      return null;
    }
  }
}
