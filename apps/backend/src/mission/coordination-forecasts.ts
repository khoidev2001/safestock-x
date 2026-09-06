import type { WeatherAlert, WeatherHorizon } from "../insights/weather";

/** Mốc giờ bản tham mưu cần: sáu giờ đầu quyết định, rồi nới dần ra ba ngày. */
export const COORDINATION_HORIZONS = [6, 12, 24, 72] as const;

export type CoordinationHorizon = (typeof COORDINATION_HORIZONS)[number];

export interface ForecastLine {
  horizonHours: CoordinationHorizon;
  status: "COMPUTED" | "PENDING_DATA" | "UNAVAILABLE";
  risk: null;
  source: string | null;
  explanation: string;
}

/**
 * Dự báo mưa theo từng mốc giờ cho bản tham mưu.
 *
 * Trước đây ba mốc 6/12/24 giờ luôn ghi "Hiện chỉ có bản ghi thời tiết 72 giờ đã
 * xác minh", trong khi nguồn thời tiết ĐÃ trả về đủ số liệu cho cả sáu mốc
 * (1, 6, 12, 24, 48, 72) và trang Theo dõi vẫn hiện chúng bình thường. Chỉ chỗ
 * này là không lấy — số liệu có sẵn mà bản tham mưu vẫn khai là chưa có.
 *
 * Hại thật chứ không phải xấu mặt: sáu giờ đầu là khung giờ quyết định của cả
 * phương án. Ba dòng "chưa có dữ liệu" đúng ở ba mốc đó khiến chỉ huy tưởng hệ
 * thống mù thời tiết ngắn hạn, trong khi con số vẫn nằm ngay trong cùng một bản
 * ghi. Mà mưa 100 mm dồn trong sáu giờ khác hẳn 100 mm rải đều ba ngày.
 */
export function buildCoordinationForecasts(weather: WeatherAlert | null): ForecastLine[] {
  if (!weather) {
    return COORDINATION_HORIZONS.map((horizonHours) => ({
      horizonHours,
      status: "UNAVAILABLE" as const,
      risk: null,
      source: null,
      explanation: "Chưa lấy được nguồn thời tiết; không giả định lượng mưa nào.",
    }));
  }

  const source = `${weather.source}:${weather.fetchedAt}`;
  return COORDINATION_HORIZONS.map((horizonHours) => {
    const horizon = weather.horizons?.find((item) => item.hours === horizonHours);
    if (!horizon) {
      // Nguồn chỉ trả được số liệu theo ngày (thiếu chuỗi giờ). Mốc 72 giờ vẫn
      // dùng được vì tổng ba ngày là con số riêng, không suy từ chuỗi giờ.
      if (horizonHours === 72) {
        return {
          horizonHours,
          status: "COMPUTED" as const,
          risk: null,
          source,
          explanation: `Mưa 72 giờ: ${weather.totalRainMm} mm; ${
            weather.alert ? "có cảnh báo" : "chưa có cảnh báo"
          }.`,
        };
      }
      return {
        horizonHours,
        status: "PENDING_DATA" as const,
        risk: null,
        source: null,
        explanation:
          "Nguồn thời tiết lần này chỉ trả số liệu theo ngày, chưa đủ chi tiết theo giờ.",
      };
    }

    return {
      horizonHours,
      status: "COMPUTED" as const,
      risk: null,
      source,
      explanation: describeHorizon(horizonHours, horizon, weather),
    };
  });
}

function describeHorizon(hours: number, horizon: WeatherHorizon, weather: WeatherAlert): string {
  const parts = [`Mưa ${hours} giờ: ${horizon.rainMm} mm`];
  if (horizon.maxWindKph != null) parts.push(`gió mạnh nhất ${horizon.maxWindKph} km/h`);
  if (hours === 72) parts.push(weather.alert ? "có cảnh báo" : "chưa có cảnh báo");
  return `${parts.join("; ")}.`;
}
