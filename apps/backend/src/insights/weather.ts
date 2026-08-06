import { Injectable, Logger } from "@nestjs/common";

const RAIN_ALERT_MM_72H = 100;
const FRESH_CACHE_MS = 10 * 60 * 1000;
const STALE_FALLBACK_MS = 6 * 60 * 60 * 1000;

/**
 * Các mốc thời gian dự báo, tính bằng giờ kể từ bây giờ.
 *
 * Chỉ có tổng mưa 72 giờ thì không đủ để quyết định: 100 mm rơi đều trong ba
 * ngày khác hẳn 100 mm dồn vào sáu tiếng tới. Người điều phối cần biết chuyện gì
 * xảy ra trong giờ tới, buổi tới, ngày tới — mỗi mốc dẫn tới một quyết định khác.
 */
export const WEATHER_HORIZONS = [1, 6, 12, 24, 48, 72] as const;

export interface WeatherHorizon {
  hours: number;
  rainMm: number;
  /** Gió giật mạnh nhất trong mốc, km/h. Null khi nguồn không trả về. */
  maxWindKph: number | null;
  maxTempC: number | null;
  minTempC: number | null;
}

export interface WeatherAlert {
  totalRainMm: number;
  alert: boolean;
  periodHours: 72;
  daily: { date: string; precipitationMm: number }[];
  /** Mưa/gió/nhiệt theo từng mốc; rỗng khi nguồn chỉ trả được số liệu ngày. */
  horizons: WeatherHorizon[];
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
  private readonly cache = new Map<string, { value: WeatherAlert; storedAt: number }>();
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
      // Xin thêm số liệu THEO GIỜ: tổng ngày không dựng lại được các mốc ngắn,
      // mà mốc 1-6 giờ mới là thứ quyết định có phải đi ngay hay không.
      const url =
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
        `&daily=precipitation_sum&forecast_days=4` +
        `&hourly=precipitation,temperature_2m,wind_speed_10m&timezone=auto`;
      const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = (await response.json()) as {
        utc_offset_seconds?: number;
        daily?: { time?: string[]; precipitation_sum?: number[] };
        hourly?: {
          time?: string[];
          precipitation?: number[];
          temperature_2m?: number[];
          wind_speed_10m?: number[];
        };
      };
      // Ba ngày đầu giữ nguyên ý nghĩa cũ (72 giờ), dù nay xin bốn ngày để đủ
      // giờ cho mốc 72 kể từ thời điểm hiện tại chứ không phải từ 0h hôm nay.
      const precipitation = (data.daily?.precipitation_sum ?? []).slice(0, 3);
      const dates = (data.daily?.time ?? []).slice(0, 3);
      const totalRainMm = precipitation.reduce((sum, v) => sum + (v ?? 0), 0);
      return {
        totalRainMm: Math.round(totalRainMm * 10) / 10,
        alert: totalRainMm >= RAIN_ALERT_MM_72H,
        periodHours: 72,
        daily: precipitation.map((value, index) => ({
          date: dates[index] ?? "",
          precipitationMm: value ?? 0,
        })),
        horizons: buildHorizons(data.hourly, data.utc_offset_seconds ?? 0),
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

/**
 * Cắt chuỗi số liệu theo giờ thành các mốc, bắt đầu từ GIỜ HIỆN TẠI.
 *
 * Open-Meteo trả từ 0h hôm nay theo giờ địa phương, nên nếu lấy thẳng từ đầu
 * mảng thì "6 giờ tới" hoá ra là sáu tiếng đã trôi qua. Dùng `utc_offset_seconds`
 * của chính phản hồi để tìm mốc hiện tại, không phụ thuộc múi giờ của máy chủ.
 */
export function buildHorizons(
  hourly:
    | {
        time?: string[];
        precipitation?: number[];
        temperature_2m?: number[];
        wind_speed_10m?: number[];
      }
    | undefined,
  utcOffsetSeconds: number,
): WeatherHorizon[] {
  const times = hourly?.time ?? [];
  if (times.length === 0) return [];
  const nowLocal = new Date(Date.now() + utcOffsetSeconds * 1000).toISOString().slice(0, 13);
  const start = times.findIndex((value) => value.slice(0, 13) >= nowLocal);
  if (start < 0) return [];

  const rain = hourly?.precipitation ?? [];
  const temp = hourly?.temperature_2m ?? [];
  const wind = hourly?.wind_speed_10m ?? [];
  const horizons: WeatherHorizon[] = [];
  for (const hours of WEATHER_HORIZONS) {
    const end = Math.min(start + hours, times.length);
    if (end <= start) continue;
    let rainMm = 0;
    let maxWind: number | null = null;
    let maxTemp: number | null = null;
    let minTemp: number | null = null;
    for (let i = start; i < end; i += 1) {
      rainMm += rain[i] ?? 0;
      const w = wind[i];
      if (typeof w === "number") maxWind = maxWind == null ? w : Math.max(maxWind, w);
      const t = temp[i];
      if (typeof t === "number") {
        maxTemp = maxTemp == null ? t : Math.max(maxTemp, t);
        minTemp = minTemp == null ? t : Math.min(minTemp, t);
      }
    }
    horizons.push({
      hours,
      rainMm: Math.round(rainMm * 10) / 10,
      maxWindKph: maxWind == null ? null : Math.round(maxWind * 10) / 10,
      maxTempC: maxTemp == null ? null : Math.round(maxTemp * 10) / 10,
      minTempC: minTemp == null ? null : Math.round(minTemp * 10) / 10,
    });
  }
  return horizons;
}
