import { buildCoordinationForecasts } from "../coordination-forecasts";
import type { WeatherAlert } from "../../insights/weather";

function weather(overrides: Partial<WeatherAlert> = {}): WeatherAlert {
  return {
    totalRainMm: 12.7,
    alert: false,
    periodHours: 72,
    daily: [],
    horizons: [
      { hours: 1, rainMm: 0.2, maxWindKph: 8, maxTempC: 29, minTempC: 28 },
      { hours: 6, rainMm: 1.1, maxWindKph: 14.5, maxTempC: 30, minTempC: 27 },
      { hours: 12, rainMm: 1.4, maxWindKph: 18, maxTempC: 31, minTempC: 26 },
      { hours: 24, rainMm: 1.6, maxWindKph: 20.1, maxTempC: 32, minTempC: 25 },
      { hours: 48, rainMm: 2.7, maxWindKph: 22, maxTempC: 32, minTempC: 25 },
      { hours: 72, rainMm: 12.7, maxWindKph: 23.2, maxTempC: 33, minTempC: 24 },
    ],
    fetchedAt: "2026-08-05T13:00:00.000Z",
    source: "open-meteo",
    ...overrides,
  };
}

describe("buildCoordinationForecasts", () => {
  it("mốc 6, 12, 24 giờ dùng SỐ THẬT chứ không báo thiếu dữ liệu", () => {
    // Sáu giờ đầu là khung giờ quyết định của cả phương án. Trước đây ba mốc này
    // luôn ghi "chỉ có bản ghi 72 giờ" trong khi số liệu đã nằm sẵn cùng bản ghi.
    const result = buildCoordinationForecasts(weather());

    const sixHour = result.find((x) => x.horizonHours === 6);
    expect(sixHour?.status).toBe("COMPUTED");
    expect(sixHour?.explanation).toContain("1.1 mm");
    expect(result.find((x) => x.horizonHours === 12)?.explanation).toContain("1.4 mm");
    expect(result.find((x) => x.horizonHours === 24)?.explanation).toContain("1.6 mm");
  });

  it("mỗi mốc đều ghi nguồn và thời điểm lấy số liệu", () => {
    const result = buildCoordinationForecasts(weather());

    for (const row of result) {
      expect(row.source).toBe("open-meteo:2026-08-05T13:00:00.000Z");
    }
  });

  it("kèm gió mạnh nhất khi nguồn có trả về", () => {
    expect(buildCoordinationForecasts(weather())[0].explanation).toContain("14.5 km/h");
  });

  it("chỉ mốc 72 giờ mới nói chuyện cảnh báo", () => {
    const result = buildCoordinationForecasts(weather({ alert: true }));

    expect(result.find((x) => x.horizonHours === 72)?.explanation).toContain("có cảnh báo");
    expect(result.find((x) => x.horizonHours === 6)?.explanation).not.toContain("cảnh báo");
  });

  it("nguồn chỉ có số liệu ngày thì vẫn giữ được mốc 72 giờ", () => {
    // Tổng ba ngày là con số riêng, không suy ra từ chuỗi giờ — mất chuỗi giờ
    // không có nghĩa là mất luôn con số đã có.
    const result = buildCoordinationForecasts(weather({ horizons: [] }));

    expect(result.find((x) => x.horizonHours === 72)?.status).toBe("COMPUTED");
    expect(result.find((x) => x.horizonHours === 72)?.explanation).toContain("12.7 mm");
    expect(result.find((x) => x.horizonHours === 6)?.status).toBe("PENDING_DATA");
  });

  it("không lấy được thời tiết thì KHÔNG bịa ra lượng mưa nào", () => {
    const result = buildCoordinationForecasts(null);

    expect(result).toHaveLength(4);
    for (const row of result) {
      expect(row.status).toBe("UNAVAILABLE");
      expect(row.source).toBeNull();
      expect(row.explanation).toContain("không giả định");
    }
  });

  it("luôn trả đủ bốn mốc theo đúng thứ tự", () => {
    expect(buildCoordinationForecasts(weather()).map((x) => x.horizonHours)).toEqual([
      6, 12, 24, 72,
    ]);
  });
});
