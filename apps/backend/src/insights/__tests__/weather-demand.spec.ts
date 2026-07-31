import { ForecastResult } from "../forecast";
import {
  classifyDemandGroup,
  computeWeatherDemandForecast,
  WeatherDemandInput,
} from "../weather-demand";

function item(overrides: Partial<WeatherDemandInput> = {}): WeatherDemandInput {
  const forecast: ForecastResult = {
    sku: "WATER-01",
    itemName: "Nước uống đóng chai",
    quantity: 20,
    avgPerDay: 5,
    ewmaPerDay: 5,
    dailyStdDev: 1,
    daysLeft: 4,
    daysLeftLow: 3,
    daysLeftHigh: 5,
    reorderPoint: 17,
    confidence: 0.75,
    lowStock: false,
  };
  return { ...forecast, categoryName: "Nước uống", unit: "lít", ...overrides };
}

describe("computeWeatherDemandForecast", () => {
  it("mưa 72h từ 100mm nhân hệ số minh bạch và cảnh báo thiếu", () => {
    const result = computeWeatherDemandForecast([item()], {
      totalRainMm: 150,
      alert: true,
      periodHours: 72,
      daily: [],
      fetchedAt: "2026-07-27T00:00:00.000Z",
      source: "open-meteo",
    })[0];

    expect(result.group).toBe("WASH");
    expect(result.baselineDemand72h).toBe(15);
    expect(result.demandFactor).toBe(1.6);
    expect(result.projectedDemand72h).toBe(24);
    expect(result.additionalDemandFromRain).toBe(9);
    expect(result.shortage).toBe(4);
    expect(result.atRisk).toBe(true);
  });

  it("mưa dưới ngưỡng hoặc thiếu weather không tự tăng nhu cầu", () => {
    expect(
      computeWeatherDemandForecast([item()], {
        totalRainMm: 80,
        alert: false,
        periodHours: 72,
        daily: [],
        fetchedAt: "2026-07-27T00:00:00.000Z",
        source: "open-meteo",
      }),
    ).toEqual([]);
    expect(computeWeatherDemandForecast([item()], null)).toEqual([]);
  });

  it("không gắn cờ thiếu khi lịch sử xuất chưa đủ tin cậy", () => {
    const [result] = computeWeatherDemandForecast([item({ confidence: 0.125 })], {
      totalRainMm: 240,
      alert: true,
      periodHours: 72,
      daily: [],
      fetchedAt: "2026-07-27T00:00:00.000Z",
      source: "open-meteo",
    });
    expect(result.dataSufficient).toBe(false);
    expect(result.atRisk).toBe(false);
  });
});

describe("classifyDemandGroup", () => {
  it.each([
    ["Áo phao trẻ em", "Thiết bị cứu sinh", "LIFE-CHILD", "RESCUE"],
    ["Gạo cứu trợ", "Lương thực", "RICE-01", "FOOD"],
    ["Chăn cứu trợ", "Che chắn khẩn cấp", "BLANKET-01", "SHELTER"],
    ["Đèn pin", "Chiếu sáng", "TORCH-01", "COMMUNICATION"],
  ])("phân nhóm %s", (itemName, categoryName, sku, expected) => {
    expect(classifyDemandGroup({ itemName, categoryName, sku })).toBe(expected);
  });
});
