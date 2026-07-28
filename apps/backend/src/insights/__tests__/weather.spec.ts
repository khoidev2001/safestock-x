import { WeatherService } from "../weather";

const response = {
  ok: true,
  json: jest.fn().mockResolvedValue({
    daily: {
      time: ["2026-07-27", "2026-07-28", "2026-07-29"],
      precipitation_sum: [40, 30.5, 35],
    },
  }),
};

describe("WeatherService cache/fallback", () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("gộp dữ liệu 72 giờ và dùng fresh cache cho lần gọi lặp", async () => {
    const fetchMock = jest
      .spyOn(global, "fetch")
      .mockResolvedValue(response as never);
    const service = new WeatherService();

    const first = await service.forecastRain(13.36, 109.03);
    const second = await service.forecastRain(13.36, 109.03);

    expect(first).toMatchObject({
      totalRainMm: 105.5,
      alert: true,
      periodHours: 72,
      cached: false,
      stale: false,
    });
    expect(second).toMatchObject({ cached: true, stale: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("mạng lỗi sau thời gian fresh dùng bản gần nhất tối đa 6 giờ", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-07-27T00:00:00Z"));
    const fetchMock = jest
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(response as never);
    const service = new WeatherService();
    await service.forecastRain(13.36, 109.03);

    jest.setSystemTime(new Date("2026-07-27T00:11:00Z"));
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    const stale = await service.forecastRain(13.36, 109.03);

    expect(stale).toMatchObject({
      totalRainMm: 105.5,
      cached: true,
      stale: true,
    });
  });
});
