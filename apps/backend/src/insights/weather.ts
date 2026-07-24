import { Injectable, Logger } from "@nestjs/common";

const RAIN_ALERT_MM_72H = 100;

export interface WeatherAlert {
  totalRainMm: number;
  alert: boolean;
}

/**
 * Cảnh báo mưa lớn 72h tới từ Open-Meteo (free, không cần key).
 * Lỗi mạng / kho chưa ghim toạ độ → trả null, KHÔNG throw chặn insights tổng hợp.
 */
@Injectable()
export class WeatherService {
  private readonly log = new Logger(WeatherService.name);

  async forecastRain(lat: number, lng: number): Promise<WeatherAlert | null> {
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=precipitation_sum&forecast_days=3&timezone=auto`;
      const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = (await response.json()) as { daily?: { precipitation_sum?: number[] } };
      const totalRainMm = (data.daily?.precipitation_sum ?? []).reduce(
        (sum, v) => sum + (v ?? 0),
        0,
      );
      return { totalRainMm, alert: totalRainMm >= RAIN_ALERT_MM_72H };
    } catch (error) {
      this.log.warn(`Open-Meteo lỗi: ${(error as Error).message}`);
      return null;
    }
  }
}
