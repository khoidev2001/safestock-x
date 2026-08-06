import { buildHorizons, WEATHER_HORIZONS } from "../weather";

/**
 * Open-Meteo trả số liệu từ 0h hôm nay theo giờ địa phương. Lấy thẳng từ đầu
 * mảng thì "6 giờ tới" hoá ra sáu tiếng ĐÃ TRÔI QUA — sai theo hướng nguy hiểm
 * nhất: báo yên trong khi mưa lớn đang tới.
 */
function hourly(startHour: number, values: number[]) {
  return {
    time: values.map((_, index) => {
      const hour = String(startHour + index).padStart(2, "0");
      return `2026-08-03T${hour}:00`;
    }),
    precipitation: values,
    temperature_2m: values.map((_, index) => 25 + index),
    wind_speed_10m: values.map((_, index) => 10 + index),
  };
}

describe("buildHorizons", () => {
  const REAL_NOW = Date.now;
  afterEach(() => {
    Date.now = REAL_NOW;
  });

  /** Giả lập "bây giờ là 03:00 giờ địa phương" với lệch múi giờ +7. */
  function freezeAtLocalHour(hour: number) {
    const localMs = Date.parse(`2026-08-03T${String(hour).padStart(2, "0")}:30:00Z`);
    Date.now = () => localMs - 7 * 3600 * 1000;
  }

  it("cắt từ giờ hiện tại, không tính giờ đã trôi qua", () => {
    freezeAtLocalHour(3);
    // 0h,1h,2h mỗi giờ 100mm (đã qua); từ 3h trở đi mỗi giờ 1mm.
    const values = [100, 100, 100, ...Array.from({ length: 20 }, () => 1)];

    const horizons = buildHorizons(hourly(0, values), 7 * 3600);

    const oneHour = horizons.find((h) => h.hours === 1);
    expect(oneHour?.rainMm).toBe(1);
    expect(horizons.find((h) => h.hours === 6)?.rainMm).toBe(6);
  });

  it("gộp đủ mưa trong mốc và lấy gió mạnh nhất", () => {
    freezeAtLocalHour(0);
    const horizons = buildHorizons(hourly(0, [2, 3, 4, 5, 6, 7, 8, 9]), 7 * 3600);

    const sixHours = horizons.find((h) => h.hours === 6);
    expect(sixHours?.rainMm).toBe(2 + 3 + 4 + 5 + 6 + 7);
    expect(sixHours?.maxWindKph).toBe(15);
    expect(sixHours?.minTempC).toBe(25);
    expect(sixHours?.maxTempC).toBe(30);
  });

  it("thiếu giờ cho mốc dài thì cắt theo dữ liệu có thật, không bịa thêm", () => {
    freezeAtLocalHour(0);
    const horizons = buildHorizons(
      hourly(
        0,
        Array.from({ length: 10 }, () => 1),
      ),
      7 * 3600,
    );

    // Chỉ có 10 giờ dữ liệu: mốc 12/24/48/72 đều dừng ở 10mm chứ không ngoại suy.
    expect(horizons.find((h) => h.hours === 72)?.rainMm).toBe(10);
    expect(horizons.map((h) => h.hours)).toEqual([...WEATHER_HORIZONS]);
  });

  it("không có số liệu theo giờ thì trả rỗng, không đoán", () => {
    expect(buildHorizons(undefined, 0)).toEqual([]);
    expect(buildHorizons({ time: [] }, 0)).toEqual([]);
  });
});
